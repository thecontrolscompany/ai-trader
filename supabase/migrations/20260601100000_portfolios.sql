-- ── Portfolios: each user can have multiple named portfolios ──────────────────

CREATE TABLE IF NOT EXISTS "portfolios" (
  "id"         uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id"    text NOT NULL,
  "name"       text NOT NULL DEFAULT 'Main',
  "mode"       text NOT NULL DEFAULT 'paper',
  "broker"     text NOT NULL DEFAULT 'alpaca',
  "is_default" text NOT NULL DEFAULT 'false',
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Tim's default portfolio (stable ID for data migration)
INSERT INTO "portfolios" ("id","user_id","name","mode","is_default")
VALUES ('00000000-0000-0000-0000-000000000020','thecontrolscompany@gmail.com','Main','paper','true')
ON CONFLICT ("id") DO NOTHING;

-- ── Add portfolio_id to child tables ──────────────────────────────────────────

ALTER TABLE "accounts"            ADD COLUMN IF NOT EXISTS "portfolio_id" uuid REFERENCES "portfolios"("id");
ALTER TABLE "transfers"           ADD COLUMN IF NOT EXISTS "portfolio_id" uuid REFERENCES "portfolios"("id");
ALTER TABLE "trades"              ADD COLUMN IF NOT EXISTS "portfolio_id" uuid REFERENCES "portfolios"("id");
ALTER TABLE "auto_trade_settings" ADD COLUMN IF NOT EXISTS "portfolio_id" uuid REFERENCES "portfolios"("id");
ALTER TABLE "auto_trade_log"      ADD COLUMN IF NOT EXISTS "portfolio_id" uuid REFERENCES "portfolios"("id");

-- Assign all existing rows to Tim's default portfolio
UPDATE "accounts"            SET "portfolio_id" = '00000000-0000-0000-0000-000000000020' WHERE "portfolio_id" IS NULL;
UPDATE "transfers"           SET "portfolio_id" = '00000000-0000-0000-0000-000000000020' WHERE "portfolio_id" IS NULL;
UPDATE "trades"              SET "portfolio_id" = '00000000-0000-0000-0000-000000000020' WHERE "portfolio_id" IS NULL;
UPDATE "auto_trade_settings" SET "portfolio_id" = '00000000-0000-0000-0000-000000000020' WHERE "portfolio_id" IS NULL;
UPDATE "auto_trade_log"      SET "portfolio_id" = '00000000-0000-0000-0000-000000000020' WHERE "portfolio_id" IS NULL;

-- Make NOT NULL now that data is backfilled
ALTER TABLE "accounts"            ALTER COLUMN "portfolio_id" SET NOT NULL;
ALTER TABLE "transfers"           ALTER COLUMN "portfolio_id" SET NOT NULL;
ALTER TABLE "trades"              ALTER COLUMN "portfolio_id" SET NOT NULL;
ALTER TABLE "auto_trade_settings" ALTER COLUMN "portfolio_id" SET NOT NULL;
