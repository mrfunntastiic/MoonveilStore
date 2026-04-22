import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { categoriesTable, productsTable } from "@workspace/db/schema";
import { sql, eq } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const inputSchema = z.object({
  name: z.string().min(1).max(80),
  emoji: z.string().max(8).nullable().optional(),
});

router.get("/categories", async (_req, res) => {
  const rows = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      emoji: categoriesTable.emoji,
      productCount: sql<number>`(select count(*) from products where category_id = ${categoriesTable.id})::int`,
    })
    .from(categoriesTable)
    .orderBy(categoriesTable.name);
  res.json(rows);
});

router.post("/categories", async (req, res) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const inserted = await db
    .insert(categoriesTable)
    .values({ name: parsed.data.name, emoji: parsed.data.emoji ?? null })
    .returning();
  const c = inserted[0]!;
  res.status(201).json({ id: c.id, name: c.name, emoji: c.emoji, productCount: 0 });
});

router.patch("/categories/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updated = await db
    .update(categoriesTable)
    .set({ name: parsed.data.name, emoji: parsed.data.emoji ?? null })
    .where(eq(categoriesTable.id, id))
    .returning();
  if (updated.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const c = updated[0]!;
  const [count] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(productsTable)
    .where(eq(productsTable.categoryId, id));
  res.json({ id: c.id, name: c.name, emoji: c.emoji, productCount: count?.c ?? 0 });
});

router.delete("/categories/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  await db.delete(categoriesTable).where(eq(categoriesTable.id, id));
  res.status(204).end();
});

export default router;
