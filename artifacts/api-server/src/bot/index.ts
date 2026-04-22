import { Bot, InlineKeyboard, session, type Context, type SessionFlavor } from "grammy";
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
import { registerAdminHandlers, notifyNewOrder } from "./admin";

interface SessionData {
  step: "idle" | "awaiting_address" | "awaiting_phone" | "awaiting_payment_method";
  draftAddress?: string;
  draftPhone?: string;
  productMessageIds: number[];
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
  const name = ctx.from?.first_name ?? "kak";
  const text = greet
    ? `Halo ${name}! 👋\n\nSelamat datang di toko kami. Pilih menu di bawah untuk mulai belanja:`
    : "Pilih menu:";
  await ctx.reply(text, { reply_markup: mainMenu() });
}

async function showCategories(ctx: BotCtx) {
  const cats = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
  if (cats.length === 0) {
    await ctx.reply("Belum ada kategori produk. Silakan kembali nanti ya!", {
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
  await ctx.reply("Pilih kategori:", { reply_markup: kb });
}

async function clearProductMessages(ctx: BotCtx) {
  const ids = ctx.session.productMessageIds ?? [];
  for (const id of ids) {
    try {
      await ctx.api.deleteMessage(ctx.chat!.id, id);
    } catch (e) {
      logger.debug({ e, id }, "failed to delete product message");
    }
  }
  ctx.session.productMessageIds = [];
}

async function showProducts(ctx: BotCtx, categoryId: number | "all") {
  await clearProductMessages(ctx);
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
    const m = await ctx.reply("Belum ada produk di kategori ini.", {
      reply_markup: new InlineKeyboard().text("« Kategori", "catalog"),
    });
    ctx.session.productMessageIds.push(m.message_id);
    return;
  }
  const header = await ctx.reply(`Menampilkan ${items.length} produk:`);
  ctx.session.productMessageIds.push(header.message_id);
  for (const p of items) {
    const stockLine = p.stock > 0 ? `Stok: ${p.stock}` : "⚠️ Stok habis";
    const caption = `*${escapeMd(p.name)}*\n${escapeMd(p.description || "")}\n\n💰 ${escapeMd(
      formatRupiah(p.priceCents),
    )}\n${escapeMd(stockLine)}`;
    const kb = new InlineKeyboard();
    if (p.stock > 0) {
      kb.text("➕ Tambah ke Keranjang", `add:${p.id}`);
    }
    let sent;
    if (p.imageUrl) {
      try {
        sent = await ctx.replyWithPhoto(p.imageUrl, {
          caption,
          parse_mode: "MarkdownV2",
          reply_markup: kb,
        });
        ctx.session.productMessageIds.push(sent.message_id);
        continue;
      } catch (e) {
        logger.warn({ e, productId: p.id }, "failed to send photo, falling back to text");
      }
    }
    sent = await ctx.reply(caption, { parse_mode: "MarkdownV2", reply_markup: kb });
    ctx.session.productMessageIds.push(sent.message_id);
  }
  const footer = await ctx.reply("Pilih lagi atau kembali:", {
    reply_markup: new InlineKeyboard()
      .text("« Kategori", "catalog")
      .text("🛒 Keranjang", "cart"),
  });
  ctx.session.productMessageIds.push(footer.message_id);
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
    await ctx.reply("🛒 Keranjang kamu kosong.\n\nYuk lihat katalog dulu!", {
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
  await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: kb });
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
  if (ctx.callbackQuery?.message) {
    try {
      await ctx.deleteMessage();
    } catch {}
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
  ctx.session.step = "awaiting_address";
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "📍 *Alamat Pengiriman*\n\nKetik alamat lengkap pengiriman \\(nama jalan, kota, kode pos\\):",
    { parse_mode: "MarkdownV2" },
  );
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
  const address = ctx.session.draftAddress ?? "";
  const phone = ctx.session.draftPhone ?? "";

  if (phone) {
    await db.update(customersTable).set({ phone, shippingAddress: address }).where(eq(customersTable.id, cust.id));
  }

  const inserted = await db
    .insert(ordersTable)
    .values({
      orderCode: code,
      customerId: cust.id,
      status: "pending",
      totalCents: total,
      shippingAddress: address,
      paymentMethod,
      notes: phone ? `Telp: ${phone}` : null,
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
  ctx.session.draftAddress = undefined;
  ctx.session.draftPhone = undefined;

  let summary = `✅ *Pesanan Dibuat*\n\n`;
  summary += `Kode: \`${escapeMd(code)}\`\n`;
  summary += `Total: *${escapeMd(formatRupiah(total))}*\n`;
  summary += `Pembayaran: ${escapeMd(paymentMethod)}\n`;
  summary += `Status: ${escapeMd(statusLabel("pending"))}\n\n`;
  summary += `Admin akan menghubungi kamu untuk konfirmasi pembayaran\\. Terima kasih sudah belanja\\! 🙏`;
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
  const cust = await ensureCustomer(ctx);
  if (!cust) return;
  const orders = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.customerId, cust.id))
    .orderBy(desc(ordersTable.createdAt))
    .limit(10);
  if (orders.length === 0) {
    await ctx.reply("Kamu belum punya pesanan.", {
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
  await ctx.reply(text, {
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
      initial: (): SessionData => ({ step: "idle", productMessageIds: [] }),
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
      transfer: "Transfer Bank",
      cod: "COD (Bayar di Tempat)",
      ewallet: "E-Wallet",
    };
    await finishOrder(ctx, labels[method] ?? method);
  });

  bot.on("message:text", async (ctx) => {
    if (ctx.session.step === "awaiting_address") {
      ctx.session.draftAddress = ctx.message.text.trim();
      ctx.session.step = "awaiting_phone";
      await ctx.reply("📞 Sekarang kirim nomor HP yang bisa dihubungi:");
      return;
    }
    if (ctx.session.step === "awaiting_phone") {
      ctx.session.draftPhone = ctx.message.text.trim();
      ctx.session.step = "awaiting_payment_method";
      await ctx.reply("💳 Pilih metode pembayaran:", {
        reply_markup: new InlineKeyboard()
          .text("🏦 Transfer Bank", "pay:transfer")
          .row()
          .text("💵 COD", "pay:cod")
          .row()
          .text("📱 E-Wallet", "pay:ewallet"),
      });
      return;
    }
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
