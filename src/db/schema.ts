import { sql } from "drizzle-orm";
import {
  doublePrecision,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const assetClassEnum = pgEnum("asset_class", [
  "stock", "etf", "bond", "crypto", "option",
]);
export const signalDirectionEnum = pgEnum("signal_direction", [
  "long", "short", "neutral",
]);
export const tradeDirEnum = pgEnum("trade_direction", ["long", "short"]);
export const tradeStatusEnum = pgEnum("trade_status", ["open", "closed", "cancelled"]);
export const accountTypeEnum = pgEnum("account_type", ["bank", "brokerage"]);

export const aiSignals = pgTable("ai_signals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ticker: text("ticker").notNull(),
  model: text("model").notNull(),
  direction: signalDirectionEnum("direction").notNull(),
  entryZoneLow: doublePrecision("entry_zone_low").notNull(),
  entryZoneHigh: doublePrecision("entry_zone_high").notNull(),
  targetPrice: doublePrecision("target_price").notNull(),
  stopLoss: doublePrecision("stop_loss").notNull(),
  timeHorizon: text("time_horizon").notNull(),
  confidence: doublePrecision("confidence").notNull(),
  reasoning: text("reasoning").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  balance: doublePrecision("balance").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transfers = pgTable("transfers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  fromAccountId: uuid("from_account_id").notNull().references(() => accounts.id),
  toAccountId: uuid("to_account_id").notNull().references(() => accounts.id),
  amount: doublePrecision("amount").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const trades = pgTable("trades", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  ticker: text("ticker").notNull(),
  assetClass: assetClassEnum("asset_class").notNull().default("stock"),
  direction: tradeDirEnum("direction").notNull(),
  status: tradeStatusEnum("status").notNull().default("open"),
  entryPrice: doublePrecision("entry_price").notNull(),
  quantity: doublePrecision("quantity").notNull(),
  stopLoss: doublePrecision("stop_loss"),
  takeProfit: doublePrecision("take_profit"),
  exitPrice: doublePrecision("exit_price"),
  fees: doublePrecision("fees").notNull().default(0),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  notes: text("notes"),
  aiSignalId: uuid("ai_signal_id").references(() => aiSignals.id),
});

export const autoTradeSettings = pgTable("auto_trade_settings", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  enabled: text("enabled").notNull().default("false"),
  model: text("model").notNull().default("openai"),
  minConfidence: doublePrecision("min_confidence").notNull().default(0.75),
  maxTradesPerDay: doublePrecision("max_trades_per_day").notNull().default(3),
  maxPositionPct: doublePrecision("max_position_pct").notNull().default(0.05),
  autoClose: text("auto_close").notNull().default("true"),
  lastRunAt: timestamp("last_run_at"),
  lastRunSummary: text("last_run_summary"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const autoTradeLog = pgTable("auto_trade_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(),  // "opened" | "closed" | "skipped" | "error"
  ticker: text("ticker"),
  tradeId: uuid("trade_id").references(() => trades.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type AISignal = typeof aiSignals.$inferSelect;
export type NewAISignal = typeof aiSignals.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
