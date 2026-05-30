TRUNCATE "auto_trade_log" CASCADE;
TRUNCATE "transfers" CASCADE;
TRUNCATE "trades" CASCADE;
TRUNCATE "ai_signals" CASCADE;
UPDATE "accounts" SET "balance" = 0;
UPDATE "auto_trade_settings" SET "last_run_at" = NULL, "last_run_summary" = NULL;
