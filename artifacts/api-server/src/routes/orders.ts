import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ordersTable, orderItemsTable, customersTable, productsTable } from "@workspace/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod/v4";
import { getBot } from "../bot";
import { statusLabel } from "../lib/format";

const router: IRouter = Router();

const statusEnum = z.enum(["pending", "paid", "processing", "shipped", "completed", "cancelled"]);

function mapOrder(r: any) {
  return {
    id: r.id,
    orderCode: r.orderCode,
    customerId: r.customerId,
    customerName: [r.customerFirstName, r.customerLastName].filter(Boolean).join(" ") || null,
    customerTelegramId: String(r.customerTelegramId),
    status: r.status,
    totalCents: r.totalCents,
    itemCount: r.itemCount,
    shippingAddress: r.shippingAddress,
    paymentMethod: r.paymentMethod,
    notes: r.notes,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

router.get("/orders", async (req, res) => {
  const status = typeof req.query["status"] === "string" ? req.query["status"] : undefined;
  const baseQuery = db
    .select({
      id: ordersTable.id,
      orderCode: ordersTable.orderCode,
      customerId: ordersTable.customerId,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerTelegramId: customersTable.telegramId,
      status: ordersTable.status,
      totalCents: ordersTable.totalCents,
      shippingAddress: ordersTable.shippingAddress,
      paymentMethod: ordersTable.paymentMethod,
      notes: ordersTable.notes,
      createdAt: ordersTable.createdAt,
      updatedAt: ordersTable.updatedAt,
      itemCount: sql<number>`(select count(*) from order_items where order_id = ${ordersTable.id})::int`,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id));
  const rows = status
    ? await baseQuery.where(eq(ordersTable.status, status)).orderBy(desc(ordersTable.createdAt))
    : await baseQuery.orderBy(desc(ordersTable.createdAt));
  res.json(rows.map(mapOrder));
});

router.get("/orders/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const rows = await db
    .select({
      id: ordersTable.id,
      orderCode: ordersTable.orderCode,
      customerId: ordersTable.customerId,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerTelegramId: customersTable.telegramId,
      status: ordersTable.status,
      totalCents: ordersTable.totalCents,
      shippingAddress: ordersTable.shippingAddress,
      paymentMethod: ordersTable.paymentMethod,
      notes: ordersTable.notes,
      createdAt: ordersTable.createdAt,
      updatedAt: ordersTable.updatedAt,
      itemCount: sql<number>`(select count(*) from order_items where order_id = ${ordersTable.id})::int`,
    })
    .from(ordersTable)
    .innerJoin(customersTable, eq(ordersTable.customerId, customersTable.id))
    .where(eq(ordersTable.id, id))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, id));
  res.json({
    ...mapOrder(rows[0]!),
    items: items.map((it) => ({
      id: it.id,
      productId: it.productId ?? 0,
      productName: it.productName,
      quantity: it.quantity,
      unitPriceCents: it.unitPriceCents,
      subtotalCents: it.subtotalCents,
    })),
  });
});

router.patch("/orders/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const parsed = z
    .object({ status: statusEnum, notes: z.string().nullable().optional() })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const update: Record<string, unknown> = {
    status: parsed.data.status,
    updatedAt: new Date(),
  };
  if (parsed.data.notes !== undefined) update["notes"] = parsed.data.notes;
  const updated = await db
    .update(ordersTable)
    .set(update)
    .where(eq(ordersTable.id, id))
    .returning();
  if (updated.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const order = updated[0]!;
  const cust = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.id, order.customerId))
    .limit(1);

  // notify customer via telegram
  const bot = getBot();
  if (bot && cust[0]) {
    try {
      await bot.api.sendMessage(
        Number(cust[0].telegramId),
        `📦 Update Pesanan ${order.orderCode}\n\nStatus: ${statusLabel(order.status)}${parsed.data.notes ? `\nCatatan: ${parsed.data.notes}` : ""}`,
      );
    } catch (e) {
      req.log.warn({ e }, "failed to notify customer");
    }

    // auto-deliver digital product file links when shipped/completed
    if (parsed.data.status === "shipped" || parsed.data.status === "completed") {
      try {
        const itemsWithFiles = await db
          .select({
            name: productsTable.name,
            digitalFileUrl: productsTable.digitalFileUrl,
            quantity: orderItemsTable.quantity,
          })
          .from(orderItemsTable)
          .innerJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
          .where(eq(orderItemsTable.orderId, id));
        const deliverables = itemsWithFiles.filter((i) => i.digitalFileUrl && i.digitalFileUrl.trim() !== "");
        if (deliverables.length > 0) {
          let msg = `🎁 *File Produk Digital - Pesanan ${order.orderCode}*\n\nTerima kasih sudah berbelanja! Berikut link unduhan produk Anda:\n\n`;
          for (const d of deliverables) {
            msg += `📁 *${d.name}*${d.quantity > 1 ? ` (x${d.quantity})` : ""}\n${d.digitalFileUrl}\n\n`;
          }
          msg += `Simpan link ini baik-baik. Jika ada kendala, balas pesan ini untuk hubungi admin.`;
          await bot.api.sendMessage(Number(cust[0].telegramId), msg, { parse_mode: "Markdown" });
        }
      } catch (e) {
        req.log.warn({ e }, "failed to deliver digital files");
      }
    }
  }

  const itemCountRow = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, id));

  res.json(
    mapOrder({
      ...order,
      customerFirstName: cust[0]?.firstName ?? null,
      customerLastName: cust[0]?.lastName ?? null,
      customerTelegramId: cust[0]?.telegramId ?? 0,
      itemCount: itemCountRow[0]?.c ?? 0,
    }),
  );
});

export default router;
