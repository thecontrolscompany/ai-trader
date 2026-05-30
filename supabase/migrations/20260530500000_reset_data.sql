-- Reset all paper trading data for a fresh start
TRUNCATE "auto_trade_log" CASCADE;
TRUNCATE "transfers" CASCADE;
TRUNCATE "trades" CASCADE;
TRUNCATE "ai_signals" CASCADE;

-- Reset account balances to $0
UPDATE "accounts" SET "balance" = 0;

-- Reset auto-trade last run info
UPDATE "auto_trade_settings" SET "last_run_at" = NULL, "last_run_summary" = NULL;
