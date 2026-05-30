CREATE TYPE "public"."asset_class" AS ENUM('stock', 'etf', 'bond', 'crypto', 'option');--> statement-breakpoint
CREATE TYPE "public"."signal_direction" AS ENUM('long', 'short', 'neutral');--> statement-breakpoint
CREATE TYPE "public"."trade_direction" AS ENUM('long', 'short');--> statement-breakpoint
CREATE TYPE "public"."trade_status" AS ENUM('open', 'closed', 'cancelled');--> statement-breakpoint
CREATE TABLE "ai_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" text NOT NULL,
	"model" text NOT NULL,
	"direction" "signal_direction" NOT NULL,
	"entry_zone_low" double precision NOT NULL,
	"entry_zone_high" double precision NOT NULL,
	"target_price" double precision NOT NULL,
	"stop_loss" double precision NOT NULL,
	"time_horizon" text NOT NULL,
	"confidence" double precision NOT NULL,
	"reasoning" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticker" text NOT NULL,
	"asset_class" "asset_class" DEFAULT 'stock' NOT NULL,
	"direction" "trade_direction" NOT NULL,
	"status" "trade_status" DEFAULT 'open' NOT NULL,
	"entry_price" double precision NOT NULL,
	"quantity" double precision NOT NULL,
	"stop_loss" double precision,
	"take_profit" double precision,
	"exit_price" double precision,
	"opened_at" timestamp DEFAULT now() NOT NULL,
	"closed_at" timestamp,
	"notes" text,
	"ai_signal_id" uuid
);
--> statement-breakpoint
ALTER TABLE "trades" ADD CONSTRAINT "trades_ai_signal_id_ai_signals_id_fk" FOREIGN KEY ("ai_signal_id") REFERENCES "public"."ai_signals"("id") ON DELETE no action ON UPDATE no action;