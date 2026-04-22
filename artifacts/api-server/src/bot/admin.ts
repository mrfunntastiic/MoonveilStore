import { Bot, InlineKeyboard, type Context, type SessionFlavor } from "grammy";
import { db } from "@workspace/db";
import {
  ordersTable,
  orderItemsTable,
  productsTable,
  customersTable,
} from "@workspace/db/schema";
import { eq, desc, sql, and, gte, lte, lt } from "drizzle-orm";
import { logger } from "../lib/logger";
import { formatRupiah, statusLabel } from "../lib/format";

interface AdminSessionShape {
  step: string;
  productMessageIds: number[];
}

type AdminCtx = Context & SessionFlavor<AdminSessionShape>;

const STATUS_FLOW: Record<string, { next?: string; label: string }> = {
  pending: { next: "paid", label: "Tandai Dibayar" },
  paid: { next: "processing", label: "Mulai Diproses" },
  processing: { next: "shipped", label: "Tandai Dikirim" },
  shipped: { next: "completed", label: "Tandai Selesai" },
};

function parseAdminIds(): Set<number> {
  const raw = process.env["ADMIN_TELEGRAM_IDS"] ?? "";
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n));
  return new Set(ids);
}

let adminIds = parseAdminIds();

export function refreshAdminIds(): void {
  adminIds = parseAdminIds();
}

export function isAdmin(telegramId: number | undefined): boolean {
  if (!telegramId) return false;
  return adminIds.has(telegramId);
}

export function getAdminIds(): number[] {
  return Array.from(adminIds);
}

function escapeMd(s: string): string {
  return s.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

function adminMenu(): InlineKeyboard {
  return new InlineKeyboard()
    .text("📥 Pesanan Baru", "adm:pending")
    .text("⏳ Diproses", "adm:processing")
    .row()
    .text("🚚 Dikirim", "adm:shipped")
    .text("✅ Selesai", "adm:completed")
    .row()
    .text("📊 Laporan Hari Ini", "adm:today")
    .text("📦 Stok Menipis", "adm:lowstock");
}

async function sendAdminMenu(ctx: AdminCtx) {
  const pendingCount = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(eq(ordersTable.status, "pending"));
  const text =
    `🛠️ *Panel Admin*\n\n` +
    `Pesanan menunggu: *${pendingCount[0]?.c ?? 0}*\n\n` +
    `Pilih menu:`;
  await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: adminMenu() });
}

async function listOrdersByStatus(ctx: AdminCtx, status: string) {
  const rows = await db
    .select({
      id: ordersTable.id,
      orderCode: ordersTable.orderCode,
      totalCents: ordersTable.totalCents,
      status: ordersTable.status,
      createdAt: ordersTable.createdAt,
      firstName: customersTable.firstName,
      lastName: customersTable.lastName,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(ordersTable.status, status))
    .orderBy(desc(ordersTable.createdAt))
    .limit(15);
  if (rows.length === 0) {
    await ctx.reply(`Tidak ada pesanan dengan status: ${statusLabel(status)}`, {
      reply_markup: new InlineKeyboard().text("« Menu Admin", "adm:menu"),
    });
    return;
  }
  const kb = new InlineKeyboard();
  let text = `*${escapeMd(statusLabel(status))}* \\(${rows.length}\\)\n\n`;
  for (const o of rows) {
    const name = [o.firstName, o.lastName].filter(Boolean).join(" ") || "Pelanggan";
    text += `\`${escapeMd(o.orderCode)}\` \\- ${escapeMd(name)}\n${escapeMd(formatRupiah(o.totalCents))}\n\n`;
    kb.text(`${o.orderCode} • ${formatRupiah(o.totalCents)}`, `adm:o:${o.id}`).row();
  }
  kb.text("« Menu Admin", "adm:menu");
  await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: kb });
}

async function showAdminOrderDetail(ctx: AdminCtx, orderId: number) {
  const rows = await db
    .select({
      id: ordersTable.id,
      orderCode: ordersTable.orderCode,
      status: ordersTable.status,
      totalCents: ordersTable.totalCents,
      shippingAddress: ordersTable.shippingAddress,
      paymentMethod: ordersTable.paymentMethod,
      notes: ordersTable.notes,
      createdAt: ordersTable.createdAt,
      firstName: customersTable.firstName,
      lastName: customersTable.lastName,
      username: customersTable.username,
      phone: customersTable.phone,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (rows.length === 0) {
    await ctx.reply("Pesanan tidak ditemukan.");
    return;
  }
  const o = rows[0]!;
  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId));
  const name = [o.firstName, o.lastName].filter(Boolean).join(" ") || "-";
  let text = `📋 *Pesanan ${escapeMd(o.orderCode)}*\n\n`;
  text += `Status: ${escapeMd(statusLabel(o.status))}\n`;
  text += `Pelanggan: ${escapeMd(name)}${o.username ? ` \\(@${escapeMd(o.username)}\\)` : ""}\n`;
  if (o.phone) text += `Telp: ${escapeMd(o.phone)}\n`;
  text += `Bayar: ${escapeMd(o.paymentMethod ?? "-")}\n`;
  text += `Total: *${escapeMd(formatRupiah(o.totalCents))}*\n\n`;
  text += `*Alamat:*\n${escapeMd(o.shippingAddress ?? "-")}\n\n`;
  text += `*Item:*\n`;
  for (const it of items) {
    text += `• ${escapeMd(it.productName)} x${it.quantity} \\= ${escapeMd(formatRupiah(it.subtotalCents))}\n`;
  }
  if (o.notes) text += `\n_${escapeMd(o.notes)}_`;

  const kb = new InlineKeyboard();
  const flow = STATUS_FLOW[o.status];
  if (flow?.next) {
    kb.text(`✅ ${flow.label}`, `adm:s:${o.id}:${flow.next}`).row();
  }
  if (o.status !== "completed" && o.status !== "cancelled") {
    kb.text("❌ Batalkan", `adm:s:${o.id}:cancelled`).row();
  }
  kb.text("« Kembali", "adm:menu");
  await ctx.reply(text, { parse_mode: "MarkdownV2", reply_markup: kb });
}

async function changeOrderStatus(ctx: AdminCtx, orderId: number, status: string) {
  const updated = await db
    .update(ordersTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId))
    .returning();
  if (updated.length === 0) {
    await ctx.answerCallbackQuery({ text: "Pesanan tidak ditemukan", show_alert: true });
    return;
  }
  const order = updated[0]!;
  const cust = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, order.customerId))
    .limit(1);
  if (cust[0]) {
    try {
      await ctx.api.sendMessage(
        Number(cust[0].telegramId),
        `📦 Update Pesanan ${order.orderCode}\n\nStatus: ${statusLabel(order.status)}`,
      );
    } catch (e) {
      logger.warn({ e }, "failed to notify customer from admin");
    }
  }
  await ctx.answerCallbackQuery({ text: `Status: ${statusLabel(status)}` });
  await showAdminOrderDetail(ctx, orderId);
}

async function showTodayReport(ctx: AdminCtx) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const rows = await db
    .select({
      status: ordersTable.status,
      total: sql<number>`coalesce(sum(${ordersTable.totalCents}),0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(ordersTable)
    .where(and(gte(ordersTable.createdAt, start), lt(ordersTable.createdAt, end)))
    .groupBy(ordersTable.status);

  const totalAll = rows.reduce((s, r) => s + r.count, 0);
  const revenue = rows
    .filter((r) => r.status === "completed" || r.status === "shipped" || r.status === "paid" || r.status === "processing")
    .reduce((s, r) => s + r.total, 0);

  let text = `📊 *Laporan Hari Ini*\n\n`;
  text += `Total pesanan: *${totalAll}*\n`;
  text += `Pendapatan: *${escapeMd(formatRupiah(revenue))}*\n\n`;
  if (rows.length === 0) {
    text += `_Belum ada pesanan hari ini\\._`;
  } else {
    for (const r of rows) {
      text += `${escapeMd(statusLabel(r.status))}: ${r.count} \\(${escapeMd(formatRupiah(r.total))}\\)\n`;
    }
  }
  await ctx.reply(text, {
    parse_mode: "MarkdownV2",
    reply_markup: new InlineKeyboard().text("« Menu Admin", "adm:menu"),
  });
}

async function showLowStock(ctx: AdminCtx) {
  const rows = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.active, true), lte(productsTable.stock, 5)))
    .orderBy(productsTable.stock)
    .limit(20);
  if (rows.length === 0) {
    await ctx.reply("✅ Semua stok aman \\(\\>5\\)\\.", {
      parse_mode: "MarkdownV2",
      reply_markup: new InlineKeyboard().text("« Menu Admin", "adm:menu"),
    });
    return;
  }
  let text = `📦 *Stok Menipis* \\(\\<\\=5\\)\n\n`;
  for (const p of rows) {
    const flag = p.stock === 0 ? "⛔" : "⚠️";
    text += `${flag} ${escapeMd(p.name)}: *${p.stock}*\n`;
  }
  await ctx.reply(text, {
    parse_mode: "MarkdownV2",
    reply_markup: new InlineKeyboard().text("« Menu Admin", "adm:menu"),
  });
}

export async function notifyNewOrder(bot: Bot<AdminCtx>, orderId: number): Promise<void> {
  if (adminIds.size === 0) return;
  const rows = await db
    .select({
      id: ordersTable.id,
      orderCode: ordersTable.orderCode,
      totalCents: ordersTable.totalCents,
      paymentMethod: ordersTable.paymentMethod,
      shippingAddress: ordersTable.shippingAddress,
      firstName: customersTable.firstName,
      lastName: customersTable.lastName,
      username: customersTable.username,
      phone: customersTable.phone,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (rows.length === 0) return;
  const o = rows[0]!;
  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId));
  const name = [o.firstName, o.lastName].filter(Boolean).join(" ") || "Pelanggan";
  let text = `🔔 *PESANAN BARU*\n\n`;
  text += `Kode: \`${escapeMd(o.orderCode)}\`\n`;
  text += `Pelanggan: ${escapeMd(name)}${o.username ? ` \\(@${escapeMd(o.username)}\\)` : ""}\n`;
  if (o.phone) text += `Telp: ${escapeMd(o.phone)}\n`;
  text += `Bayar: ${escapeMd(o.paymentMethod ?? "-")}\n`;
  text += `Total: *${escapeMd(formatRupiah(o.totalCents))}*\n\n`;
  text += `*Item:*\n`;
  for (const it of items) {
    text += `• ${escapeMd(it.productName)} x${it.quantity}\n`;
  }
  text += `\n*Alamat:* ${escapeMd(o.shippingAddress ?? "-")}`;
  const kb = new InlineKeyboard()
    .text("📋 Lihat & Kelola", `adm:o:${o.id}`)
    .row()
    .text("✅ Tandai Dibayar", `adm:s:${o.id}:paid`);
  for (const adminId of adminIds) {
    try {
      await bot.api.sendMessage(adminId, text, {
        parse_mode: "MarkdownV2",
        reply_markup: kb,
      });
    } catch (e) {
      logger.warn({ e, adminId }, "failed to notify admin of new order");
    }
  }
}

export function registerAdminHandlers(bot: Bot<AdminCtx>): void {
  bot.command("admin", async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.reply("Maaf, perintah ini khusus admin.");
      return;
    }
    await sendAdminMenu(ctx);
  });

  bot.callbackQuery(/^adm:(.+)$/, async (ctx) => {
    if (!isAdmin(ctx.from?.id)) {
      await ctx.answerCallbackQuery({ text: "Khusus admin", show_alert: true });
      return;
    }
    const action = ctx.match![1]!;
    if (action === "menu") {
      await ctx.answerCallbackQuery();
      await sendAdminMenu(ctx);
      return;
    }
    if (action === "today") {
      await ctx.answerCallbackQuery();
      await showTodayReport(ctx);
      return;
    }
    if (action === "lowstock") {
      await ctx.answerCallbackQuery();
      await showLowStock(ctx);
      return;
    }
    if (action === "pending" || action === "processing" || action === "shipped" || action === "completed") {
      await ctx.answerCallbackQuery();
      await listOrdersByStatus(ctx, action);
      return;
    }
    const orderMatch = action.match(/^o:(\d+)$/);
    if (orderMatch) {
      await ctx.answerCallbackQuery();
      await showAdminOrderDetail(ctx, Number(orderMatch[1]));
      return;
    }
    const statusMatch = action.match(/^s:(\d+):(\w+)$/);
    if (statusMatch) {
      await changeOrderStatus(ctx, Number(statusMatch[1]), statusMatch[2]!);
      return;
    }
    await ctx.answerCallbackQuery();
  });
}
