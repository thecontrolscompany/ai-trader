-- Add fees column to trades (Robinhood-style regulatory fees on sells)
ALTER TABLE "trades" ADD COLUMN "fees" double precision NOT NULL DEFAULT 0;
