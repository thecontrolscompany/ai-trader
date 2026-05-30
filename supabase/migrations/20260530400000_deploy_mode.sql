ALTER TABLE "auto_trade_settings"
  ADD COLUMN IF NOT EXISTS "deploy_mode" text NOT NULL DEFAULT 'spread';
