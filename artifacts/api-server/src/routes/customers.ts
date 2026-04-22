import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { customersTable, ordersTable } from "@workspace/db/schema";
import { sql, eq, ne, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/customers", async (_req, res) => {
  const rows = await db
    .select({
      id: customersTable.id,
      telegramId: customersTable.telegramId,
      username: customersTable.username,
      firstName: customersTable.firstName,
      lastName: customersTable.lastName,
      phone: customersTable.phone,
      createdAt: customersTable.createdAt,
      orderCount: sql<number>`(select count(*) from orders where customer_id = ${customersTable.id} and status != 'cancelled')::int`,
      totalSpentCents: sql<number>`(select coalesce(sum(total_cents),0) from orders where customer_id = ${customersTable.id} and status != 'cancelled')::int`,
    })
    .from(customersTable)
    .orderBy(desc(customersTable.createdAt));
  // suppress unused imports lint
  void ordersTable; void ne; void eq;
  res.json(
    rows.map((r) => ({
      id: r.id,
      telegramId: String(r.telegramId),
      username: r.username,
      firstName: r.firstName,
      lastName: r.lastName,
      phone: r.phone,
      orderCount: r.orderCount,
      totalSpentCents: r.totalSpentCents,
      createdAt: r.createdAt.toISOString(),
    })),
  );
});

export default router;
