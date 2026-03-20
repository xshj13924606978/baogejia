import {
  pgTable,
  serial,
  varchar,
  text,
  timestamp,
  index,
  foreignKey,
  unique,
  integer,
  date,
  boolean,
  numeric,
  jsonb,
  check,
  json,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const suppliers = pgTable('suppliers', {
  id: serial().primaryKey().notNull(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  logoUrl: text('logo_url'),
  contactPerson: varchar('contact_person', { length: 100 }),
  phone: varchar({ length: 20 }),
  email: varchar({ length: 255 }),
  address: text(),
  bankName: varchar('bank_name', { length: 255 }),
  bankAccount: varchar('bank_account', { length: 255 }),
  taxNumber: varchar('tax_number', { length: 100 }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const healthCheck = pgTable('health_check', {
  id: serial().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const invites = pgTable(
  'invites',
  {
    id: serial().primaryKey().notNull(),
    userId: integer('user_id'),
    inviteCode: varchar('invite_code', { length: 50 }).notNull(),
    inviteeId: integer('invitee_id'),
    inviteeUsername: varchar('invitee_username', { length: 50 }),
    status: varchar({ length: 20 }).default('pending'),
    pointsAwarded: integer('points_awarded').default(0),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
    registeredAt: timestamp('registered_at', { mode: 'string' }),
  },
  (table) => [
    index('idx_invites_code').using('btree', table.inviteCode.asc().nullsLast().op('text_ops')),
    index('idx_invites_user_id').using('btree', table.userId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'invites_user_id_fkey',
    }),
    foreignKey({
      columns: [table.inviteeId],
      foreignColumns: [users.id],
      name: 'invites_invitee_id_fkey',
    }),
    unique('invites_invite_code_key').on(table.inviteCode),
  ]
);

export const customers = pgTable('customers', {
  id: serial().primaryKey().notNull(),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  projectName: varchar('project_name', { length: 255 }),
  contactPerson: varchar('contact_person', { length: 100 }),
  phone: varchar({ length: 20 }),
  email: varchar({ length: 255 }),
  address: text(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const pointExchanges = pgTable(
  'point_exchanges',
  {
    id: serial().primaryKey().notNull(),
    userId: integer('user_id'),
    itemType: varchar('item_type', { length: 50 }),
    itemName: varchar('item_name', { length: 100 }),
    pointsCost: integer('points_cost'),
    status: varchar({ length: 20 }).default('pending'),
    expiryDate: date('expiry_date'),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('idx_point_exchanges_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('int4_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'point_exchanges_user_id_fkey',
    }),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial().primaryKey().notNull(),
    userId: integer('user_id'),
    type: varchar({ length: 50 }),
    title: varchar({ length: 200 }),
    content: text(),
    isRead: boolean('is_read').default(false),
    link: varchar({ length: 200 }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  },
  (table) => [
    index('idx_notifications_is_read').using(
      'btree',
      table.isRead.asc().nullsLast().op('bool_ops')
    ),
    index('idx_notifications_user_id').using(
      'btree',
      table.userId.asc().nullsLast().op('int4_ops')
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'notifications_user_id_fkey',
    }),
  ]
);

export const products = pgTable(
  'products',
  {
    id: serial().primaryKey().notNull(),
    // 统一产品字段规范
    category: varchar({ length: 100 }),           // 分类
    name: varchar({ length: 255 }).notNull(),     // 产品名称（必填）
    model: varchar({ length: 255 }),              // 规格型号
    parameter_description: text('parameter_description'), // 参数描述
    brand: varchar({ length: 255 }),              // 品牌
    unit: varchar({ length: 50 }),                // 单位
    supplier: varchar({ length: 255 }),           // 供应商
    contact_person: varchar('contact_person', { length: 100 }), // 联系人
    contact_phone: varchar('contact_phone', { length: 50 }),    // 联系电话
    cost_price: numeric('cost_price', { precision: 10, scale: 2 }), // 成本价
    min_price: numeric('min_price', { precision: 10, scale: 2 }),   // 最低售价
    price: numeric({ precision: 10, scale: 2 }).notNull(), // 指导价（必填）
    image_url: text('image_url'),                 // 产品图片
    // 系统字段
    stock: integer().default(0),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    userId: integer('user_id'),
    manufacturerId: integer('manufacturer_id'),
    rankBoost: integer('rank_boost').default(0),
    verified: boolean().default(false),
    viewCount: integer('view_count').default(0),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'products_user_id_fkey',
    }).onDelete('set null'),
    foreignKey({
      columns: [table.manufacturerId],
      foreignColumns: [users.id],
      name: 'products_manufacturer_id_fkey',
    }).onDelete('set null'),
  ]
);

export const userLevels = pgTable(
  'user_levels',
  {
    id: serial().primaryKey().notNull(),
    userId: integer('user_id'),
    level: integer().default(1),
    currentPoints: integer('current_points').default(0),
    nextLevelPoints: integer('next_level_points').default(100),
    levelUpAt: timestamp('level_up_at', { mode: 'string' }),
  },
  (table) => [
    index('idx_user_levels_user_id').using('btree', table.userId.asc().nullsLast().op('int4_ops')),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_levels_user_id_fkey',
    }),
  ]
);

export const quoteTerms = pgTable('quote_terms', {
  id: serial().primaryKey().notNull(),
  name: varchar({ length: 255 }).notNull(),
  paymentTerms: text('payment_terms').default('预付30%，发货前付清'),
  warrantyPeriod: integer('warranty_period').default(12),
  deliveryPeriod: integer('delivery_period').default(7),
  validityPeriod: integer('validity_period').default(15),
  remarks: text(),
  isDefault: boolean('is_default').default(false),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const quotes = pgTable(
  'quotes',
  {
    id: serial().primaryKey().notNull(),
    customerId: integer('customer_id'),
    quoteTermsId: integer('quote_terms_id'),
    quoteNumber: varchar('quote_number', { length: 50 }).notNull(),
    products: jsonb().notNull(),
    subtotal: numeric({ precision: 12, scale: 2 }).notNull(),
    taxRate: numeric('tax_rate', { precision: 5, scale: 2 }).default('13.00'),
    taxAmount: numeric('tax_amount', { precision: 12, scale: 2 }).default('0'),
    totalAmount: numeric('total_amount', { precision: 12, scale: 2 }).notNull(),
    status: varchar({ length: 20 }).default('draft'),
    customRemarks: text('custom_remarks'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'quotes_customer_id_fkey',
    }),
    foreignKey({
      columns: [table.quoteTermsId],
      foreignColumns: [quoteTerms.id],
      name: 'quotes_quote_terms_id_fkey',
    }),
    unique('quotes_quote_number_key').on(table.quoteNumber),
  ]
);

export const conversations = pgTable(
  'conversations',
  {
    id: serial().primaryKey().notNull(),
    title: varchar({ length: 255 }).default('新对话'),
    messages: jsonb().notNull(),
    quoteId: integer('quote_id'),
    customerId: integer('customer_id'),
    isArchived: boolean('is_archived').default(false),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.quoteId],
      foreignColumns: [quotes.id],
      name: 'conversations_quote_id_fkey',
    }),
    foreignKey({
      columns: [table.customerId],
      foreignColumns: [customers.id],
      name: 'conversations_customer_id_fkey',
    }),
  ]
);

export const pointRecords = pgTable(
  'point_records',
  {
    id: serial().primaryKey().notNull(),
    userId: integer('user_id'),
    points: integer().notNull(),
    type: varchar({ length: 50 }),
    referenceId: integer('reference_id'),
    description: text(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'point_records_user_id_fkey',
    }).onDelete('cascade'),
  ]
);

export const manufacturerPayments = pgTable(
  'manufacturer_payments',
  {
    id: serial().primaryKey().notNull(),
    userId: integer('user_id'),
    rankPosition: integer('rank_position'),
    monthlyFee: numeric('monthly_fee', { precision: 10, scale: 2 }),
    startDate: date('start_date'),
    endDate: date('end_date'),
    status: varchar({ length: 20 }).default('active'),
    category: varchar({ length: 50 }),
    keywords: text(),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'manufacturer_payments_user_id_fkey',
    }).onDelete('cascade'),
    check(
      'manufacturer_payments_rank_position_check',
      sql`(rank_position >= 1) AND (rank_position <= 5)`
    ),
  ]
);

export const userUploads = pgTable(
  'user_uploads',
  {
    id: serial().primaryKey().notNull(),
    userId: varchar('user_id', { length: 255 }),
    fileName: varchar('file_name', { length: 500 }),
    fileKey: varchar('file_key', { length: 500 }),
    fileSize: integer('file_size'),
    fileType: varchar('file_type', { length: 100 }),
    publicUrl: text('public_url'),
    status: varchar('status', { length: 20 }).default('uploaded'),
    type: varchar({ length: 50 }),
    title: varchar({ length: 200 }),
    description: text(),
    fileUrl: text('file_url'),
    pointsAwarded: integer('points_awarded'),
    views: integer().default(0),
    downloads: integer().default(0),
    reviewedBy: integer('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { mode: 'string' }),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: 'user_uploads_user_id_fkey',
    }).onDelete('cascade'),
    foreignKey({
      columns: [table.reviewedBy],
      foreignColumns: [users.id],
      name: 'user_uploads_reviewed_by_fkey',
    }),
  ]
);

export const brandRecommendations = pgTable('brand_recommendations', {
  id: serial().primaryKey().notNull(),
  quoteId: integer('quote_id'),
  productName: varchar('product_name', { length: 200 }),
  recommendedBrands: json('recommended_brands'),
  userClicked: integer('user_clicked').default(0),
  createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: serial().primaryKey().notNull(),
    username: varchar({ length: 50 }).notNull(),
    password: varchar({ length: 255 }), // 旧明文密码字段，保留用于向后兼容迁移
    password_hash: varchar('password_hash', { length: 255 }), // bcrypt 加密密码
    email: varchar({ length: 100 }),
    phone: varchar({ length: 20 }),
    role: varchar({ length: 20 }).default('pending'),
    status: varchar({ length: 20 }).default('active'),
    points: integer().default(0),
    totalPoints: integer('total_points').default(0),
    company: varchar({ length: 100 }),
    contact: varchar({ length: 50 }),
    verified: boolean().default(false),
    createdAt: timestamp('created_at', { mode: 'string' }).defaultNow(),
    updatedAt: timestamp('updated_at', { mode: 'string' }),
    lastLogin: timestamp('last_login', { mode: 'string' }),
    quotaUsed: integer('quota_used').default(0),
    quotaTotal: integer('quota_total').default(10),
    expireDate: date('expire_date'),
  },
  (table) => [
    unique('users_username_key').on(table.username),
    unique('users_email_key').on(table.email),
  ]
);
