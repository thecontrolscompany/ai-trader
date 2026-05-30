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

export const tradeStatusEnum = pgEnum("trade_status", [
  "open", "closed", "cancelled",
]);

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
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  notes: text("notes"),
  aiSignalId: uuid("ai_signal_id").references(() => aiSignals.id),
});

export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type AISignal = typeof aiSignals.$inferSelect;
export type NewAISignal = typeof aiSignals.$inferInsert;
