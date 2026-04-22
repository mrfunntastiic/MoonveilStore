import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { productsTable, categoriesTable } from "@workspace/db/schema";
import { eq, and, ilike, desc, type SQL } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

const inputSchema = z.object({
  categoryId: z.number().int().nullable().optional(),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(""),
  priceCents: z.number().int().min(0),
  imageUrl: z.string().url().nullable().optional(),
  stock: z.number().int().min(0),
  active: z.boolean(),
});

function row(r: any) {
  return {
    id: r.id,
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    name: r.name,
    description: r.description,
    priceCents: r.priceCents,
    imageUrl: r.imageUrl,
    stock: r.stock,
    active: r.active,
    createdAt: r.createdAt.toISOString(),
  };
}

router.get("/products", async (req, res) => {
  const conds: SQL[] = [];
  const search = typeof req.query["search"] === "string" ? req.query["search"] : "";
  const categoryId = req.query["categoryId"] ? Number(req.query["categoryId"]) : undefined;
  if (search) conds.push(ilike(productsTable.name, `%${search}%`));
  if (categoryId) conds.push(eq(productsTable.categoryId, categoryId));

  const where = conds.length ? and(...conds) : undefined;
  const baseQuery = db
    .select({
      id: productsTable.id,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      name: productsTable.name,
      description: productsTable.description,
      priceCents: productsTable.priceCents,
      imageUrl: productsTable.imageUrl,
      stock: productsTable.stock,
      active: productsTable.active,
      createdAt: productsTable.createdAt,
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id));

  const rows = where
    ? await baseQuery.where(where).orderBy(desc(productsTable.createdAt))
    : await baseQuery.orderBy(desc(productsTable.createdAt));
  res.json(rows.map(row));
});

router.get("/products/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const rows = await db
    .select({
      id: productsTable.id,
      categoryId: productsTable.categoryId,
      categoryName: categoriesTable.name,
      name: productsTable.name,
      description: productsTable.description,
      priceCents: productsTable.priceCents,
      imageUrl: productsTable.imageUrl,
      stock: productsTable.stock,
      active: productsTable.active,
      createdAt: productsTable.createdAt,
    })
    .from(productsTable)
    .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
    .where(eq(productsTable.id, id))
    .limit(1);
  if (rows.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.json(row(rows[0]!));
});

router.post("/products", async (req, res) => {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const inserted = await db
    .insert(productsTable)
    .values({
      categoryId: parsed.data.categoryId ?? null,
      name: parsed.data.name,
      description: parsed.data.description,
      priceCents: parsed.data.priceCents,
      imageUrl: parsed.data.imageUrl ?? null,
      stock: parsed.data.stock,
      active: parsed.data.active,
    })
    .returning();
  const p = inserted[0]!;
  let categoryName: string | null = null;
  if (p.categoryId) {
    const c = await db.select().from(categoriesTable).where(eq(categoriesTable.id, p.categoryId)).limit(1);
    categoryName = c[0]?.name ?? null;
  }
  res.status(201).json(row({ ...p, categoryName }));
});

router.patch("/products/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updated = await db
    .update(productsTable)
    .set({
      categoryId: parsed.data.categoryId ?? null,
      name: parsed.data.name,
      description: parsed.data.description,
      priceCents: parsed.data.priceCents,
      imageUrl: parsed.data.imageUrl ?? null,
      stock: parsed.data.stock,
      active: parsed.data.active,
    })
    .where(eq(productsTable.id, id))
    .returning();
  if (updated.length === 0) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const p = updated[0]!;
  let categoryName: string | null = null;
  if (p.categoryId) {
    const c = await db.select().from(categoriesTable).where(eq(categoriesTable.id, p.categoryId)).limit(1);
    categoryName = c[0]?.name ?? null;
  }
  res.json(row({ ...p, categoryName }));
});

router.delete("/products/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.status(204).end();
});

export default router;
