import { pgTable, serial, timestamp, text, varchar, decimal, integer, jsonb, boolean } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 供应方信息表
export const suppliers = pgTable("suppliers", {
	id: serial().primaryKey(),
	companyName: varchar("company_name", { length: 255 }).notNull(),
	logoUrl: text("logo_url"),
	contactPerson: varchar("contact_person", { length: 100 }),
	phone: varchar("phone", { length: 20 }),
	email: varchar("email", { length: 255 }),
	address: text("address"),
	bankName: varchar("bank_name", { length: 255 }),
	bankAccount: varchar("bank_account", { length: 255 }),
	taxNumber: varchar("tax_number", { length: 100 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 客户信息表
export const customers = pgTable("customers", {
	id: serial().primaryKey(),
	companyName: varchar("company_name", { length: 255 }).notNull(),
	projectName: varchar("project_name", { length: 255 }),
	contactPerson: varchar("contact_person", { length: 100 }),
	phone: varchar("phone", { length: 20 }),
	email: varchar("email", { length: 255 }),
	address: text("address"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 产品信息表
export const products = pgTable("products", {
	id: serial().primaryKey(),
	name: varchar("name", { length: 255 }).notNull(),
	model: varchar("model", { length: 255 }),
	specifications: text("specifications"), // 规格参数 JSON 字符串
	price: decimal("price", { precision: 10, scale: 2 }).notNull(),
	stock: integer("stock").default(0),
	supplier: varchar("supplier", { length: 255 }),
	category: varchar("category", { length: 100 }),
	description: text("description"),
	imageUrl: text("image_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 商务条款表
export const quoteTerms = pgTable("quote_terms", {
	id: serial().primaryKey(),
	name: varchar("name", { length: 255 }).notNull(), // 条款模板名称
	paymentTerms: text("payment_terms").default("预付30%，发货前付清"),
	warrantyPeriod: integer("warranty_period").default(12), // 质保期（月）
	deliveryPeriod: integer("delivery_period").default(7), // 交货期（工作日）
	validityPeriod: integer("validity_period").default(15), // 报价有效期（天）
	remarks: text("remarks"),
	isDefault: boolean("is_default").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 报价单表
export const quotes = pgTable("quotes", {
	id: serial().primaryKey(),
	customerId: integer("customer_id").references(() => customers.id),
	quoteTermsId: integer("quote_terms_id").references(() => quoteTerms.id),
	quoteNumber: varchar("quote_number", { length: 50 }).notNull().unique(),
	products: jsonb("products").notNull(), // 产品清单 JSON 数组
	subtotal: decimal("subtotal", { precision: 12, scale: 2 }).notNull(),
	taxRate: decimal("tax_rate", { precision: 5, scale: 2 }).default('13'),
	taxAmount: decimal("tax_amount", { precision: 12, scale: 2 }).default('0'),
	totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
	status: varchar("status", { length: 20 }).default("draft"), // draft, sent, accepted, rejected
	customRemarks: text("custom_remarks"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 对话记录表
export const conversations = pgTable("conversations", {
	id: serial().primaryKey(),
	title: varchar("title", { length: 255 }).default("新对话"),
	messages: jsonb("messages").notNull(), // 对话消息 JSON 数组
	quoteId: integer("quote_id").references(() => quotes.id),
	customerId: integer("customer_id").references(() => customers.id),
	isArchived: boolean("is_archived").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});
