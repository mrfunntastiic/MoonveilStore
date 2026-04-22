import { Bot, InlineKeyboard, InputFile, session, type Context, type SessionFlavor } from "grammy";
import path from "node:path";
import { existsSync } from "node:fs";
import { db } from "@workspace/db";
import {
  customersTable,
  productsTable,
  categoriesTable,
  cartItemsTable,
  ordersTable,
  orderItemsTable,
} from "@workspace/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger";
import { formatRupiah, generateOrderCode, statusLabel } from "../lib/format";
import { registerAdminHandlers, notifyNewOrder, forwardPaymentProofToAdmins, isAdmin } from "./admin";
import { clearNav, sendNav, sendNavPhoto, tryDeleteIncoming, type NavSession } from "./nav";

interface SessionData extends NavSession {
  step: "idle" | "awaiting_phone" | "awaiting_payment_method";
  draftPhone?: string;
}

type BotCtx = Context & SessionFlavor<SessionData>;

const token = process.env["TELEGRAM_BOT_TOKEN"];

let botInstance: Bot<BotCtx> | null = null;
let botUsername: string | null = null;
let botFirstName: string | null = null;
let botConnected = false;

export function getBot(): Bot<BotCtx> | null {
  return botInstance;
}

export function getBotMeta() {
  return {
    username: botUsername,
    firstName: botFirstName,
    connected: botConnected,
    link: botUsername ? `https://t.me/${botUsername}` : null,
  };
}

async function ensureCustomer(ctx: BotCtx) {
  const u = ctx.from;
  if (!u) return null;
  const existing = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.telegramId, u.id))
    .limit(1);
  if (existing.length > 0) {
    const cust = existing[0]!;
    if (
      cust.username !== (u.username ?? null) ||
      cust.firstName !== (u.first_name ?? null) ||
      cust.lastName !== (u.last_name ?? null)
    ) {
      await db
        .update(customersTable)
        .set({
          username: u.username ?? null,
          firstName: u.first_name ?? null,
          lastName: u.last_name ?? null,
        })
        .where(eq(customersTable.id, cust.id));
    }
    return cust;
  }
  const inserted = await db
    .insert(customersTable)
    .values({
      telegramId: u.id,
      username: u.username ?? null,
      firstName: u.first_name ?? null,
      lastName: u.last_name ?? null,
    })
    .returning();
  return inserted[0]!;
}

function mainMenu() {
  return new InlineKeyboard()
    .text("🛍️ Lihat Katalog", "catalog")
    .text("🛒 Keranjang", "cart")
    .row()
    .text("📦 Pesanan Saya", "orders")
    .text("❓ Bantuan", "help");
}

async function sendMainMenu(ctx: BotCtx, greet = true) {
  await clearNav(ctx);
  const name = ctx.from?.first_name ?? "kak";
  const text = greet
    ? `Halo ${name}! 👋\n\nSelamat datang di toko kami. Pilih menu di bawah untuk mulai belanja:`
    : "Pilih menu:";
  await sendNav(ctx, text, { reply_markup: mainMenu() });
}

async function showCategories(ctx: BotCtx) {
  await clearNav(ctx);
  const cats = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
  if (cats.length === 0) {
    await sendNav(ctx, "Belum ada kategori produk. Silakan kembali nanti ya!", {
      reply_markup: new InlineKeyboard().text("« Menu Utama", "menu"),
    });
    return;
  }
  const kb = new InlineKeyboard();
  for (const c of cats) {
    const label = c.emoji ? `${c.emoji} ${c.name}` : c.name;
    kb.text(label, `cat:${c.id}`).row();
  }
  kb.text("📋 Semua Produk", "cat:all").row();
  kb.text("« Menu Utama", "menu");
  await sendNav(ctx, "Pilih kategori:", { reply_markup: kb });
}

async function showProducts(ctx: BotCtx, categoryId: number | "all") {
  await clearNav(ctx);
  const where =
    categoryId === "all"
      ? eq(productsTable.active, true)
      : and(eq(productsTable.active, true), eq(productsTable.categoryId, categoryId));
  const items = await db
    .select()
    .from(productsTable)
    .where(where)
    .orderBy(desc(productsTable.createdAt))
    .limit(20);
  if (items.length === 0) {
    await sendNav(ctx, "Belum ada produk di kategori ini.", {
      reply_markup: new InlineKeyboard().text("« Kategori", "catalog"),
    });
    return;
  }
  await sendNav(ctx, `Menampilkan ${items.length} produk:`);
  for (const p of items) {
    const stockLine = p.stock > 0 ? `Stok: ${p.stock}` : "⚠️ Stok habis";
    const caption = `*${escapeMd(p.name)}*\n${escapeMd(p.description || "")}\n\n💰 ${escapeMd(
      formatRupiah(p.priceCents),
    )}\n${escapeMd(stockLine)}`;
    const kb = new InlineKeyboard();
    if (p.stock > 0) {
      kb.text("➕ Tambah ke Keranjang", `add:${p.id}`);
    }
    if (p.imageUrl) {
      try {
        await sendNavPhoto(ctx, p.imageUrl, {
          caption,
          parse_mode: "MarkdownV2",
          reply_markup: kb,
        });
        continue;
      } catch (e) {
        logger.warn({ e, productId: p.id }, "failed to send photo, falling back to text");
      }
    }
    await sendNav(ctx, caption, { parse_mode: "MarkdownV2", reply_markup: kb });
  }
  await sendNav(ctx, "Pilih lagi atau kembali:", {
    reply_markup: new InlineKeyboard()
      .text("« Kategori", "catalog")
      .text("🛒 Keranjang", "cart"),
  });
}

function escapeMd(s: string): string {
  return s.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

async function addToCart(ctx: BotCtx, productId: number) {
  const cust = await ensureCustomer(ctx);
  if (!cust) return;
  const prod = await db.select().from(productsTable).where(eq(productsTable.id, productId)).limit(1);
  if (prod.length === 0 || !prod[0]!.active) {
    await ctx.answerCallbackQuery({ text: "Produk tidak tersedia", show_alert: true });
    return;
  }
  if (prod[0]!.stock <= 0) {
    await ctx.answerCallbackQuery({ text: "Stok habis", show_alert: true });
    return;
  }
  const existing = await db
    .select()
    .from(cartItemsTable)
    .where(and(eq(cartItemsTable.customerId, cust.id), eq(cartItemsTable.productId, productId)))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(cartItemsTable)
      .set({ quantity: existing[0]!.quantity + 1 })
      .where(eq(cartItemsTable.id, existing[0]!.id));
  } else {
    await db.insert(cartItemsTable).values({
      customerId: cust.id,
      productId,
      quantity: 1,
    });
  }
  await ctx.answerCallbackQuery({ text: `✅ ${prod[0]!.name} ditambahkan ke keranjang` });
}

async function showCart(ctx: BotCtx) {
  await clearNav(ctx);
  const cust = await ensureCustomer(ctx);
  if (!cust) return;
  const items = await db
    .select({
      cartId: cartItemsTable.id,
      productId: productsTable.id,
      name: productsTable.name,
      priceCents: productsTable.priceCents,
      stock: productsTable.stock,
      quantity: cartItemsTable.quantity,
    })
    .from(cartItemsTable)
    .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .where(eq(cartItemsTable.customerId, cust.id));
  if (items.length === 0) {
    await sendNav(ctx, "🛒 Keranjang kamu kosong.\n\nYuk lihat katalog dulu!", {
      reply_markup: new InlineKeyboard().text("🛍️ Katalog", "catalog").text("« Menu", "menu"),
    });
    return;
  }
  let total = 0;
  let text = "🛒 *Keranjang Belanja*\n\n";
  for (const it of items) {
    const sub = it.priceCents * it.quantity;
    total += sub;
    text += `• ${escapeMd(it.name)}\n  ${it.quantity} × ${escapeMd(formatRupiah(it.priceCents))} \\= ${escapeMd(formatRupiah(sub))}\n\n`;
  }
  text += `*Total: ${escapeMd(formatRupiah(total))}*`;
  const kb = new InlineKeyboard();
  for (const it of items) {
    kb.text(`➖ ${it.name.slice(0, 18)}`, `dec:${it.cartId}`)
      .text(`➕`, `inc:${it.cartId}`)
      .text(`🗑️`, `rm:${it.cartId}`)
      .row();
  }
  kb.text("✅ Checkout", "checkout").row();
  kb.text("🛍️ Lanjut Belanja", "catalog").text("« Menu", "menu");
  await sendNav(ctx, text, { parse_mode: "MarkdownV2", reply_markup: kb });
}

async function modifyCartItem(ctx: BotCtx, cartId: number, action: "inc" | "dec" | "rm") {
  const cust = await ensureCustomer(ctx);
  if (!cust) return;
  const item = await db.select().from(cartItemsTable).where(eq(cartItemsTable.id, cartId)).limit(1);
  if (item.length === 0 || item[0]!.customerId !== cust.id) {
    await ctx.answerCallbackQuery({ text: "Item tidak ditemukan" });
    return;
  }
  if (action === "rm") {
    await db.delete(cartItemsTable).where(eq(cartItemsTable.id, cartId));
    await ctx.answerCallbackQuery({ text: "Dihapus" });
  } else if (action === "inc") {
    await db
      .update(cartItemsTable)
      .set({ quantity: item[0]!.quantity + 1 })
      .where(eq(cartItemsTable.id, cartId));
    await ctx.answerCallbackQuery({ text: "+1" });
  } else {
    if (item[0]!.quantity <= 1) {
      await db.delete(cartItemsTable).where(eq(cartItemsTable.id, cartId));
    } else {
      await db
        .update(cartItemsTable)
        .set({ quantity: item[0]!.quantity - 1 })
        .where(eq(cartItemsTable.id, cartId));
    }
    await ctx.answerCallbackQuery({ text: "-1" });
  }
  await showCart(ctx);
}

async function startCheckout(ctx: BotCtx) {
  const cust = await ensureCustomer(ctx);
  if (!cust) return;
  const items = await db
    .select()
    .from(cartItemsTable)
    .where(eq(cartItemsTable.customerId, cust.id));
  if (items.length === 0) {
    await ctx.answerCallbackQuery({ text: "Keranjang kosong", show_alert: true });
    return;
  }
  await clearNav(ctx);
  ctx.session.step = "awaiting_payment_method";
  await ctx.answerCallbackQuery();
  await sendNav(ctx, "💳 Pilih metode pembayaran:", {
    reply_markup: new InlineKeyboard()
      .text("📱 QRIS", "pay:qris")
      .row()
      .text("🏦 Transfer Bank", "pay:transfer")
      .row()
      .text("💰 E-Wallet", "pay:ewallet"),
  });
}

async function finishOrder(ctx: BotCtx, paymentMethod: string) {
  const cust = await ensureCustomer(ctx);
  if (!cust) return;
  const items = await db
    .select({
      cartId: cartItemsTable.id,
      productId: productsTable.id,
      name: productsTable.name,
      priceCents: productsTable.priceCents,
      stock: productsTable.stock,
      quantity: cartItemsTable.quantity,
    })
    .from(cartItemsTable)
    .innerJoin(productsTable, eq(cartItemsTable.productId, productsTable.id))
    .where(eq(cartItemsTable.customerId, cust.id));
  if (items.length === 0) {
    await ctx.reply("Keranjang kosong.");
    return;
  }
  for (const it of items) {
    if (it.quantity > it.stock) {
      await ctx.reply(`⚠️ Stok ${it.name} tidak cukup. Silakan kurangi jumlah di keranjang.`);
      ctx.session.step = "idle";
      return;
    }
  }
  const total = items.reduce((s, it) => s + it.priceCents * it.quantity, 0);
  const code = generateOrderCode();
  const phone = ctx.session.draftPhone ?? "";

  if (phone) {
    await db.update(customersTable).set({ phone }).where(eq(customersTable.id, cust.id));
  }

  const inserted = await db
    .insert(ordersTable)
    .values({
      orderCode: code,
      customerId: cust.id,
      status: "pending",
      totalCents: total,
      shippingAddress: "Produk Digital",
      paymentMethod,
      notes: phone ? `Kontak: ${phone}` : null,
    })
    .returning();
  const order = inserted[0]!;
  await db.insert(orderItemsTable).values(
    items.map((it) => ({
      orderId: order.id,
      productId: it.productId,
      productName: it.name,
      quantity: it.quantity,
      unitPriceCents: it.priceCents,
      subtotalCents: it.priceCents * it.quantity,
    })),
  );
  for (const it of items) {
    await db
      .update(productsTable)
      .set({ stock: sql`${productsTable.stock} - ${it.quantity}` })
      .where(eq(productsTable.id, it.productId));
  }
  await db.delete(cartItemsTable).where(eq(cartItemsTable.customerId, cust.id));

  ctx.session.step = "idle";
  ctx.session.draftPhone = undefined;

  await clearNav(ctx);
  let summary = `✅ *Pesanan Dibuat*\n\n`;
  summary += `Kode: \`${escapeMd(code)}\`\n`;
  summary += `Total: *${escapeMd(formatRupiah(total))}*\n`;
  summary += `Pembayaran: ${escapeMd(paymentMethod)}\n`;
  summary += `Status: ${escapeMd(statusLabel("pending"))}\n\n`;
  summary += `Admin akan menghubungi kamu untuk konfirmasi pembayaran\\. Terima kasih sudah belanja\\! 🙏`;
  // INVOICE: not tracked in nav, stays permanently in chat
  await ctx.reply(summary, {
    parse_mode: "MarkdownV2",
    reply_markup: new InlineKeyboard().text("📦 Pesanan Saya", "orders").text("« Menu", "menu"),
  });

  try {
    await notifyNewOrder(botInstance!, order.id);
  } catch (e) {
    logger.warn({ e }, "failed to notify admin of new order");
  }
}

async function showOrders(ctx: BotCtx) {
  await clearNav(ctx);
  const cust = await ensureCustomer(ctx);
  if (!cust) return;
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.customerId, cust.id))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);
  if (orders.length === 0) {
    await sendNav(ctx, "Kamu belum punya pesanan.", {
      reply_markup: new InlineKeyboard().text("🛍️ Belanja Sekarang", "catalog").text("« Menu", "menu"),
    });
    return;
  }
  let text = "📦 *Pesanan Kamu*\n\n";
  for (const o of orders) {
    text += `\`${escapeMd(o.orderCode)}\`\n`;
    text += `${escapeMd(statusLabel(o.status))} \\- ${escapeMd(formatRupiah(o.totalCents))}\n`;
    text += `${escapeMd(o.createdAt.toLocaleDateString("id-ID"))}\n\n`;
  }
  await sendNav(ctx, text, {
    parse_mode: "MarkdownV2",
    reply_markup: new InlineKeyboard().text("« Menu Utama", "menu"),
  });
}

export async function startTelegramBot(): Promise<void> {
  if (!token) {
    logger.warn("TELEGRAM_BOT_TOKEN not set, bot disabled");
    return;
  }
  if (botInstance) return;

  const bot = new Bot<BotCtx>(token);
  botInstance = bot;

  bot.use(
    session({
      initial: (): SessionData => ({ step: "idle", navMessageIds: [] }),
    }),
  );

  registerAdminHandlers(bot);

  bot.command("start", async (ctx) => {
    await ensureCustomer(ctx);
    ctx.session.step = "idle";
    await sendMainMenu(ctx, true);
  });

  bot.command("menu", async (ctx) => {
    ctx.session.step = "idle";
    await sendMainMenu(ctx, false);
  });

  bot.command("katalog", async (ctx) => {
    await showCategories(ctx);
  });

  bot.command("keranjang", async (ctx) => {
    await showCart(ctx);
  });

  bot.command("pesanan", async (ctx) => {
    await showOrders(ctx);
  });

  bot.command("bantuan", async (ctx) => {
    await ctx.reply(
      "❓ *Bantuan*\n\n" +
        "/start \\- Mulai bot\n" +
        "/menu \\- Menu utama\n" +
        "/katalog \\- Lihat produk\n" +
        "/keranjang \\- Lihat keranjang\n" +
        "/pesanan \\- Riwayat pesanan\n\n" +
        "Cara belanja:\n1\\. Pilih *Katalog*\n2\\. Tambahkan produk ke *Keranjang*\n3\\. *Checkout* dan isi alamat\n4\\. Pilih metode pembayaran\n5\\. Tunggu konfirmasi admin",
      { parse_mode: "MarkdownV2" },
    );
  });

  bot.callbackQuery("menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await sendMainMenu(ctx, false);
  });

  bot.callbackQuery("catalog", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showCategories(ctx);
  });

  bot.callbackQuery("cart", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showCart(ctx);
  });

  bot.callbackQuery("orders", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showOrders(ctx);
  });

  bot.callbackQuery("help", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply(
      "❓ Bantuan\n\nGunakan /menu untuk kembali ke menu utama kapan saja. Pilih Katalog untuk melihat produk, tambahkan ke Keranjang, lalu Checkout.",
    );
  });

  bot.callbackQuery(/^cat:(.+)$/, async (ctx) => {
    const id = ctx.match![1]!;
    await ctx.answerCallbackQuery();
    await showProducts(ctx, id === "all" ? "all" : Number(id));
  });

  bot.callbackQuery(/^add:(\d+)$/, async (ctx) => {
    const id = Number(ctx.match![1]);
    await addToCart(ctx, id);
  });

  bot.callbackQuery(/^(inc|dec|rm):(\d+)$/, async (ctx) => {
    const action = ctx.match![1] as "inc" | "dec" | "rm";
    const id = Number(ctx.match![2]);
    await modifyCartItem(ctx, id, action);
  });

  bot.callbackQuery("checkout", async (ctx) => {
    await startCheckout(ctx);
  });

  bot.callbackQuery(/^pay:(.+)$/, async (ctx) => {
    const method = ctx.match![1]!;
    await ctx.answerCallbackQuery();
    const labels: Record<string, string> = {
      qris: "QRIS",
      transfer: "Transfer Bank",
      ewallet: "E-Wallet",
    };
    const label = labels[method] ?? method;
    await finishOrder(ctx, label);
    if (method === "qris") {
      const qrisCaption =
        "📱 *Pembayaran QRIS \\- Moonveil Creations*\n\n" +
        "Scan QR di atas dengan aplikasi e\\-wallet \\(GoPay, OVO, Dana, ShopeePay, dll\\) atau mobile banking\\.\n\n" +
        "Setelah bayar, kirim *bukti transfer* ke chat ini\\. Produk akan dikirim setelah pembayaran terkonfirmasi admin\\.";
      const localQris = path.join(process.cwd(), "assets", "qris.png");
      const envQris = process.env["QRIS_IMAGE_URL"];
      try {
        if (envQris) {
          await ctx.replyWithPhoto(envQris, { caption: qrisCaption, parse_mode: "MarkdownV2" });
        } else if (existsSync(localQris)) {
          await ctx.replyWithPhoto(new InputFile(localQris), {
            caption: qrisCaption,
            parse_mode: "MarkdownV2",
          });
        } else {
          await ctx.reply(qrisCaption, { parse_mode: "MarkdownV2" });
        }
      } catch (e) {
        logger.warn({ e }, "failed to send QRIS image");
        await ctx.reply(qrisCaption, { parse_mode: "MarkdownV2" });
      }
    }
  });

  bot.on(["message:photo", "message:document", "message:video"], async (ctx, next) => {
    if (isAdmin(ctx.from?.id)) {
      await next();
      return;
    }
    const cust = await ensureCustomer(ctx);
    if (!cust) return;
    const recent = await db
      .select({
        id: ordersTable.id,
        orderCode: ordersTable.orderCode,
        totalCents: ordersTable.totalCents,
        status: ordersTable.status,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.customerId, cust.id),
          sql`${ordersTable.status} in ('pending','paid','processing')`,
        ),
      )
      .orderBy(desc(ordersTable.createdAt))
      .limit(1);
    const order = recent[0] ?? null;
    const name = [cust.firstName, cust.lastName].filter(Boolean).join(" ") || "Pelanggan";
    try {
      await forwardPaymentProofToAdmins(
        botInstance!,
        ctx.chat!.id,
        ctx.message!.message_id,
        name,
        cust.username ?? null,
        order,
      );
    } catch (e) {
      logger.warn({ e }, "failed to forward payment proof");
    }
    await ctx.reply(
      order
        ? `✅ Bukti pembayaran untuk pesanan ${order.orderCode} sudah diterima. Admin akan segera memverifikasi. Terima kasih!`
        : "✅ Terima kasih! Bukti sudah diterima admin.",
      { reply_markup: new InlineKeyboard().text("📦 Pesanan Saya", "orders").text("« Menu", "menu") },
    );
  });

  bot.on("message:text", async (ctx) => {
    await ctx.reply("Gunakan menu di bawah atau ketik /menu untuk navigasi.", {
      reply_markup: mainMenu(),
    });
  });

  bot.catch((err) => {
    logger.error({ err: err.error }, "telegram bot error");
  });

  try {
    const me = await bot.api.getMe();
    botUsername = me.username;
    botFirstName = me.first_name;
    botConnected = true;
    logger.info({ username: me.username }, "telegram bot connected");
  } catch (e) {
    logger.error({ e }, "failed to get bot info");
  }

  bot.start({
    drop_pending_updates: true,
    onStart: (info) => {
      logger.info({ username: info.username }, "telegram bot polling started");
    },
  }).catch((e) => {
    logger.error({ e }, "telegram bot polling failed");
    botConnected = false;
  });
}

export async function broadcastToCustomers(message: string): Promise<{ sent: number; failed: number }> {
  if (!botInstance) return { sent: 0, failed: 0 };
  const customers = await db.select().from(customersTable);
  let sent = 0;
  let failed = 0;
  for (const c of customers) {
    try {
      await botInstance.api.sendMessage(c.telegramId, message);
      sent++;
      await new Promise((r) => setTimeout(r, 50));
    } catch (e) {
      failed++;
      logger.warn({ e, telegramId: c.telegramId }, "broadcast failed for customer");
    }
  }
  return { sent, failed };
}

export async function notifyAdminOfOrder(orderId: number): Promise<void> {
  // placeholder for future admin chat id notification
  logger.info({ orderId }, "order created");
}
