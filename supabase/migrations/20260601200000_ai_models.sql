CREATE TABLE "ai_models" (
  "id"            uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name"          text NOT NULL,
  "provider"      text NOT NULL DEFAULT 'openai',
  "model_id"      text NOT NULL DEFAULT 'gpt-4o',
  "custom_prompt" text,
  "status"        text NOT NULL DEFAULT 'testing',
  "paper_only"    text NOT NULL DEFAULT 'true',
  "notes"         text,
  "created_at"    timestamp DEFAULT now() NOT NULL,
  "updated_at"    timestamp DEFAULT now() NOT NULL
);

-- Seed the default active model
INSERT INTO "ai_models" ("id","name","provider","model_id","status","paper_only","notes")
VALUES
  ('00000000-0000-0000-0000-000000000030','GPT-4o Standard','openai','gpt-4o','active','false','Default active model. Used by all portfolios for auto-trade and deploy.'),
  ('00000000-0000-0000-0000-000000000031','Claude Sonnet 4.6','claude','claude-sonnet-4-6','testing','true','Test model. Promote to active when ready.');
