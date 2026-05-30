CREATE TABLE "auto_trade_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "enabled" text NOT NULL DEFAULT 'false',
  "model" text NOT NULL DEFAULT 'openai',
  "min_confidence" double precision NOT NULL DEFAULT 0.75,
  "max_trades_per_day" double precision NOT NULL DEFAULT 3,
  "max_position_pct" double precision NOT NULL DEFAULT 0.05,
  "auto_close" text NOT NULL DEFAULT 'true',
  "scan_frequency" text NOT NULL DEFAULT '4x',
  "last_run_at" timestamp,
  "last_run_summary" text,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "auto_trade_log" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "action" text NOT NULL,
  "ticker" text,
  "trade_id" uuid REFERENCES "trades"("id"),
  "reason" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Seed one settings row with stable ID
INSERT INTO "auto_trade_settings" ("id") VALUES ('00000000-0000-0000-0000-000000000010')
ON CONFLICT ("id") DO NOTHING;
