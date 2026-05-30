-- Cash account types
CREATE TYPE "public"."account_type" AS ENUM('bank', 'brokerage');

-- Accounts table
CREATE TABLE "accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "type" "account_type" NOT NULL,
  "balance" double precision NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Transfers table (movements between accounts)
CREATE TABLE "transfers" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "from_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "to_account_id" uuid NOT NULL REFERENCES "accounts"("id"),
  "amount" double precision NOT NULL,
  "note" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Seed the two accounts with stable IDs
INSERT INTO "accounts" ("id", "name", "type", "balance") VALUES
  ('00000000-0000-0000-0000-000000000001', 'Bank Account',     'bank',      0),
  ('00000000-0000-0000-0000-000000000002', 'Brokerage Account','brokerage', 0)
ON CONFLICT ("id") DO NOTHING;
