import { pgTable, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { productsTable } from "./products";

export const cartItemsTable = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "cascade" }).notNull(),
    productId: integer("product_id").references(() => productsTable.id, { onDelete: "cascade" }).notNull(),
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqueCustomerProduct: uniqueIndex("cart_items_customer_product_idx").on(t.customerId, t.productId),
  }),
);

export type CartItem = typeof cartItemsTable.$inferSelect;
export type InsertCartItem = typeof cartItemsTable.$inferInsert;
