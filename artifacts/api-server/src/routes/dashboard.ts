import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  productsTable,
  customersTable,
  orderItemsTable,
} from "@workspace/db/schema";
import { sql, eq, desc, and, gte, ne } from "drizzle-orm";

const router: IRouter = Router();

router.get("/dashboard/summary", async (_req, res) => {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [revenueAll] = await db
    .select({
      total: sql<number>`coalesce(sum(${ordersTable.totalCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(ordersTable)
    .where(ne(ordersTable.status, "cancelled"));

  const [pending] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(eq(ordersTable.status, "pending"));

  const [custs] = await db.select({ count: sql<number>`count(*)::int` }).from(customersTable);

  const [prodAll] = await db.select({ count: sql<number>`count(*)::int` }).from(productsTable);
  const [prodActive] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(productsTable)
    .where(eq(productsTable.active, true));

  const [today] = await db
    .select({
      total: sql<number>`coalesce(sum(${ordersTable.totalCents}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(ordersTable)
    .where(and(ne(ordersTable.status, "cancelled"), gte(ordersTable.createdAt, startOfDay)));

  res.json({
    totalRevenueCents: revenueAll?.total ?? 0,
    totalOrders: revenueAll?.count ?? 0,
    pendingOrders: pending?.count ?? 0,
    totalCustomers: custs?.count ?? 0,
    totalProducts: prodAll?.count ?? 0,
    activeProducts: prodActive?.count ?? 0,
    revenueTodayCents: today?.total ?? 0,
    ordersToday: today?.count ?? 0,
  });
});

router.get("/dashboard/sales-trend", async (_req, res) => {
  const since = new Date();
  since.setDate(since.getDate() - 13);
  since.setHours(0, 0, 0, 0);

  const rows = await db
    .select({
      date: sql<string>`to_char(${ordersTable.createdAt}, 'YYYY-MM-DD')`,
      revenueCents: sql<number>`coalesce(sum(${ordersTable.totalCents}), 0)::int`,
      orders: sql<number>`count(*)::int`,
    })
    .from(ordersTable)
    .where(and(ne(ordersTable.status, "cancelled"), gte(ordersTable.createdAt, since)))
    .groupBy(sql`to_char(${ordersTable.createdAt}, 'YYYY-MM-DD')`);

  const map = new Map(rows.map((r) => [r.date, r]));
  const out: Array<{ date: string; revenueCents: number; orders: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const row = map.get(key);
    out.push({
      date: key,
      revenueCents: row?.revenueCents ?? 0,
      orders: row?.orders ?? 0,
    });
  }
  res.json(out);
});

router.get("/dashboard/top-products", async (_req, res) => {
  const rows = await db
    .select({
      productId: orderItemsTable.productId,
      productName: orderItemsTable.productName,
      unitsSold: sql<number>`sum(${orderItemsTable.quantity})::int`,
      revenueCents: sql<number>`sum(${orderItemsTable.subtotalCents})::int`,
    })
    .from(orderItemsTable)
    .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(ne(ordersTable.status, "cancelled"))
    .groupBy(orderItemsTable.productId, orderItemsTable.productName)
    .orderBy(desc(sql`sum(${orderItemsTable.quantity})`))
    .limit(5);

  res.json(
    rows.map((r) => ({
      productId: r.productId ?? 0,
      productName: r.productName,
      unitsSold: r.unitsSold,
      revenueCents: r.revenueCents,
    })),
  );
});

router.get("/dashboard/recent-orders", async (_req, res) => {
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
    .orderBy(desc(ordersTable.createdAt))
    .limit(8);

  res.json(
    rows.map((r) => ({
      id: r.id,
      orderCode: r.orderCode,
      customerId: r.customerId,
      customerName:
        [r.customerFirstName, r.customerLastName].filter(Boolean).join(" ") || null,
      customerTelegramId: String(r.customerTelegramId),
      status: r.status,
      totalCents: r.totalCents,
      itemCount: r.itemCount,
      shippingAddress: r.shippingAddress,
      paymentMethod: r.paymentMethod,
      notes: r.notes,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
  );
});

export default router;
