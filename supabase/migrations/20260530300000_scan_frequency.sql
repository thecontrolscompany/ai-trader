ALTER TABLE "auto_trade_settings"
  ADD COLUMN IF NOT EXISTS "scan_frequency" text NOT NULL DEFAULT '4x';
