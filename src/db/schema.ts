import { sql } from "drizzle-orm";
import {
  doublePrecision,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const assetClassEnum = pgEnum("asset_class", ["stock","etf","bond","crypto","option"]);
export const signalDirectionEnum = pgEnum("signal_direction", ["long","short","neutral"]);
export const tradeDirEnum = pgEnum("trade_direction", ["long","short"]);
export const tradeStatusEnum = pgEnum("trade_status", ["open","closed","cancelled"]);
export const accountTypeEnum = pgEnum("account_type", ["bank","brokerage"]);

// AI model configurations — admin manages these, active model is used by all portfolios
export const aiModels = pgTable("ai_models", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),                          // "GPT-4o Standard", "Claude Sonnet", "Experimental v2"
  provider: text("provider").notNull().default("openai"), // openai | claude
  modelId: text("model_id").notNull().default("gpt-4o"),  // actual model identifier
  customPrompt: text("custom_prompt"),                    // optional override for system prompt
  status: text("status").notNull().default("testing"),    // active | testing | retired
  paperOnly: text("paper_only").notNull().default("true"), // test models are paper-only
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

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
  estimatedScanCostUsd: doublePrecision("estimated_scan_cost_usd").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// Each Google user can have multiple named portfolios (paper or live)
export const portfolios = pgTable("portfolios", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull(),          // Google email
  name: text("name").notNull(),               // "Main", "GPT-4o Test", "Live Alpaca"
  mode: text("mode").notNull().default("paper"), // paper | live
  broker: text("broker").notNull().default("alpaca"),
  isDefault: text("is_default").notNull().default("false"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  balance: doublePrecision("balance").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transfers = pgTable("transfers", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
  fromAccountId: uuid("from_account_id").notNull().references(() => accounts.id),
  toAccountId: uuid("to_account_id").notNull().references(() => accounts.id),
  amount: doublePrecision("amount").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const trades = pgTable("trades", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
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
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
  enabled: text("enabled").notNull().default("false"),
  model: text("model").notNull().default("openai"),
  minConfidence: doublePrecision("min_confidence").notNull().default(0.75),
  maxTradesPerDay: doublePrecision("max_trades_per_day").notNull().default(3),
  maxPositionPct: doublePrecision("max_position_pct").notNull().default(0.05),
  autoClose: text("auto_close").notNull().default("true"),
  scanFrequency: text("scan_frequency").notNull().default("4x"),
  deployMode: text("deploy_mode").notNull().default("spread"),
  lastRunAt: timestamp("last_run_at"),
  lastRunSummary: text("last_run_summary"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const autoTradeLog = pgTable("auto_trade_log", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioId: uuid("portfolio_id").references(() => portfolios.id),
  action: text("action").notNull(),
  ticker: text("ticker"),
  tradeId: uuid("trade_id").references(() => trades.id),
  reason: text("reason"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// One row per portfolio per calendar day (ET). Upserted on each page load.
// Used to calculate daily / weekly / monthly return %.
export const portfolioSnapshots = pgTable("portfolio_snapshots", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  portfolioId: uuid("portfolio_id").notNull().references(() => portfolios.id),
  date: text("date").notNull(), // YYYY-MM-DD in ET
  totalValue: doublePrecision("total_value").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
}, (t) => [unique("portfolio_snapshots_portfolio_date").on(t.portfolioId, t.date)]);

export type Portfolio = typeof portfolios.$inferSelect;
export type Trade = typeof trades.$inferSelect;
export type NewTrade = typeof trades.$inferInsert;
export type AISignal = typeof aiSignals.$inferSelect;
export type NewAISignal = typeof aiSignals.$inferInsert;
export type Account = typeof accounts.$inferSelect;
export type Transfer = typeof transfers.$inferSelect;
