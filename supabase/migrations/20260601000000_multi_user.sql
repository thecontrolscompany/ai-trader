-- Multi-user support: add user_id to all per-user tables
-- Existing data assigned to Tim's account

ALTER TABLE "accounts"           ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL DEFAULT 'thecontrolscompany@gmail.com';
ALTER TABLE "transfers"          ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL DEFAULT 'thecontrolscompany@gmail.com';
ALTER TABLE "trades"             ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL DEFAULT 'thecontrolscompany@gmail.com';
ALTER TABLE "auto_trade_settings" ADD COLUMN IF NOT EXISTS "user_id" text NOT NULL DEFAULT 'thecontrolscompany@gmail.com';
ALTER TABLE "auto_trade_log"      ADD COLUMN IF NOT EXISTS "user_id" text;

-- Assign existing rows to Tim
UPDATE "accounts"            SET "user_id" = 'thecontrolscompany@gmail.com';
UPDATE "transfers"           SET "user_id" = 'thecontrolscompany@gmail.com';
UPDATE "trades"              SET "user_id" = 'thecontrolscompany@gmail.com';
UPDATE "auto_trade_settings" SET "user_id" = 'thecontrolscompany@gmail.com';
UPDATE "auto_trade_log"      SET "user_id" = 'thecontrolscompany@gmail.com';

-- Drop the old hardcoded stable IDs — accounts are now created dynamically per user
-- (The old rows already have user_id set, so they become Tim's accounts)
