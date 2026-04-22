import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { customersTable } from "./customers";
import { productsTable } from "./products";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  orderCode: text("order_code").notNull().unique(),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "restrict" }).notNull(),
  status: text("status").notNull().default("pending"),
  totalCents: integer("total_cents").notNull(),
  shippingAddress: text("shipping_address"),
  paymentMethod: text("payment_method"),
  notes: text("notes"),
  deliveryFileId: text("delivery_file_id"),
  deliveryFileType: text("delivery_file_type"),
  deliveryFileName: text("delivery_file_name"),
  deliveryCaption: text("delivery_caption"),
  deliveryUploadedAt: timestamp("delivery_uploaded_at", { withTimezone: true }),
  deliverySentAt: timestamp("delivery_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const orderItemsTable = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "cascade" }).notNull(),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  quantity: integer("quantity").notNull(),
  unitPriceCents: integer("unit_price_cents").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(),
});

export type Order = typeof ordersTable.$inferSelect;
export type InsertOrder = typeof ordersTable.$inferInsert;
export type OrderItem = typeof orderItemsTable.$inferSelect;
export type InsertOrderItem = typeof orderItemsTable.$inferInsert;
