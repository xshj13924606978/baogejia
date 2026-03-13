import { relations } from 'drizzle-orm/relations';
import {
  users,
  invites,
  pointExchanges,
  notifications,
  products,
  userLevels,
  customers,
  quotes,
  quoteTerms,
  conversations,
  pointRecords,
  manufacturerPayments,
  userUploads,
} from './schema';

export const invitesRelations = relations(invites, ({ one }) => ({
  user_userId: one(users, {
    fields: [invites.userId],
    references: [users.id],
    relationName: 'invites_userId_users_id',
  }),
  user_inviteeId: one(users, {
    fields: [invites.inviteeId],
    references: [users.id],
    relationName: 'invites_inviteeId_users_id',
  }),
}));

export const usersRelations = relations(users, ({ many }) => ({
  invites_userId: many(invites, {
    relationName: 'invites_userId_users_id',
  }),
  invites_inviteeId: many(invites, {
    relationName: 'invites_inviteeId_users_id',
  }),
  pointExchanges: many(pointExchanges),
  notifications: many(notifications),
  products_userId: many(products, {
    relationName: 'products_userId_users_id',
  }),
  products_manufacturerId: many(products, {
    relationName: 'products_manufacturerId_users_id',
  }),
  userLevels: many(userLevels),
  pointRecords: many(pointRecords),
  manufacturerPayments: many(manufacturerPayments),
  userUploads_userId: many(userUploads, {
    relationName: 'userUploads_userId_users_id',
  }),
  userUploads_reviewedBy: many(userUploads, {
    relationName: 'userUploads_reviewedBy_users_id',
  }),
}));

export const pointExchangesRelations = relations(pointExchanges, ({ one }) => ({
  user: one(users, {
    fields: [pointExchanges.userId],
    references: [users.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
}));

export const productsRelations = relations(products, ({ one }) => ({
  user_userId: one(users, {
    fields: [products.userId],
    references: [users.id],
    relationName: 'products_userId_users_id',
  }),
  user_manufacturerId: one(users, {
    fields: [products.manufacturerId],
    references: [users.id],
    relationName: 'products_manufacturerId_users_id',
  }),
}));

export const userLevelsRelations = relations(userLevels, ({ one }) => ({
  user: one(users, {
    fields: [userLevels.userId],
    references: [users.id],
  }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  customer: one(customers, {
    fields: [quotes.customerId],
    references: [customers.id],
  }),
  quoteTerm: one(quoteTerms, {
    fields: [quotes.quoteTermsId],
    references: [quoteTerms.id],
  }),
  conversations: many(conversations),
}));

export const customersRelations = relations(customers, ({ many }) => ({
  quotes: many(quotes),
  conversations: many(conversations),
}));

export const quoteTermsRelations = relations(quoteTerms, ({ many }) => ({
  quotes: many(quotes),
}));

export const conversationsRelations = relations(conversations, ({ one }) => ({
  quote: one(quotes, {
    fields: [conversations.quoteId],
    references: [quotes.id],
  }),
  customer: one(customers, {
    fields: [conversations.customerId],
    references: [customers.id],
  }),
}));

export const pointRecordsRelations = relations(pointRecords, ({ one }) => ({
  user: one(users, {
    fields: [pointRecords.userId],
    references: [users.id],
  }),
}));

export const manufacturerPaymentsRelations = relations(manufacturerPayments, ({ one }) => ({
  user: one(users, {
    fields: [manufacturerPayments.userId],
    references: [users.id],
  }),
}));

export const userUploadsRelations = relations(userUploads, ({ one }) => ({
  user_userId: one(users, {
    fields: [userUploads.userId],
    references: [users.id],
    relationName: 'userUploads_userId_users_id',
  }),
  user_reviewedBy: one(users, {
    fields: [userUploads.reviewedBy],
    references: [users.id],
    relationName: 'userUploads_reviewedBy_users_id',
  }),
}));
