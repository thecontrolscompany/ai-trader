/**
 * Fetches the active AI model configuration from the database.
 * Falls back to GPT-4o if no active model is set.
 */
import { db } from "@/db";
import { aiModels } from "@/db/schema";
import { eq } from "drizzle-orm";

export interface ActiveModel {
  id: string;
  name: string;
  provider: string;    // "openai" | "claude"
  modelId: string;     // "gpt-4o" | "claude-sonnet-4-6" etc.
  customPrompt: string | null;
  paperOnly: string;
}

const FALLBACK: ActiveModel = {
  id: "fallback",
  name: "GPT-4o",
  provider: "openai",
  modelId: "gpt-4o",
  customPrompt: null,
  paperOnly: "false",
};

export async function getActiveModel(): Promise<ActiveModel> {
  try {
    const [model] = await db.select().from(aiModels).where(eq(aiModels.status, "active")).limit(1);
    return model ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export async function getTestModels(): Promise<ActiveModel[]> {
  try {
    return await db.select().from(aiModels).where(eq(aiModels.status, "testing"));
  } catch {
    return [];
  }
}
