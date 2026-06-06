import {
  boolean,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";

// ── NextAuth tables ──────────────────────────────────────────
export const users = pgTable("User", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
});

export const accounts = pgTable("Account", {
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
  refresh_token_expires_in: integer("refresh_token_expires_in"),
}, (account) => ([
  primaryKey({ columns: [account.provider, account.providerAccountId] }),
]));

export const sessions = pgTable("Session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable("VerificationToken", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: timestamp("expires", { mode: "date" }).notNull(),
}, (vt) => ([
  primaryKey({ columns: [vt.identifier, vt.token] }),
]));

// ── App tables ───────────────────────────────────────────────
export const userProfiles = pgTable("UserProfile", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().unique().references(() => users.id),
  profession: text("profession"),
  taxRegime: text("taxRegime").notNull().default("new"),
  monthlyBudgets: jsonb("monthlyBudgets"),
});

export const receipts = pgTable("Receipt", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text("userId").notNull().references(() => users.id),
  imageUrl: text("imageUrl").notNull(),
  status: text("status").notNull().default("processing"),
  merchant: text("merchant"),
  date: timestamp("date", { mode: "date" }),
  category: text("category"),
  currency: text("currency").notNull().default("INR"),
  subtotal: numeric("subtotal").default("0"),
  tax: numeric("tax").default("0"),
  fees: numeric("fees").default("0"),
  fines: numeric("fines").default("0"),
  total: numeric("total").default("0"),
  gstCredit: numeric("gstCredit").default("0"),
  isBusinessExp: boolean("isBusinessExp").default(false),
  flagged: boolean("flagged").default(false),
  flagReason: text("flagReason"),
  gstRate: numeric("gstRate", { precision: 5, scale: 2 }).default("0"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
});

export const lineItems = pgTable("LineItem", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  receiptId: text("receiptId").notNull().references(() => receipts.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: integer("quantity").default(1),
  price: numeric("price").notNull(),
});

// ── Relations ────────────────────────────────────────────────
import { relations } from "drizzle-orm";

export const receiptsRelations = relations(receipts, ({ many }) => ({
  items: many(lineItems),
}));

export const lineItemsRelations = relations(lineItems, ({ one }) => ({
  receipt: one(receipts, {
    fields: [lineItems.receiptId],
    references: [receipts.id],
  }),
}));