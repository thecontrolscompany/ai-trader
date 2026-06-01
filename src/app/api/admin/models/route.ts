import { db } from "@/db";
import { aiModels } from "@/db/schema";
import { auth } from "@/auth";
import { isAdmin } from "@/lib/admin";
import { newId } from "@/lib/id";
import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";

async function requireAdmin() {
  const session = await auth();
  if (!isAdmin(session?.user?.email)) {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const models = await db.select().from(aiModels).orderBy(aiModels.createdAt);
  return NextResponse.json(models);
}

export async function POST(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await req.json();
  const { name, provider, modelId, customPrompt, notes } = body;
  if (!name || !provider || !modelId)
    return NextResponse.json({ error: "name, provider, modelId required" }, { status: 400 });
  const [model] = await db.insert(aiModels)
    .values({ id: newId(), name, provider, modelId, customPrompt: customPrompt ?? null, status: "testing", paperOnly: "true", notes: notes ?? null })
    .returning();
  return NextResponse.json(model, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  // Only one model can be active at a time
  if (updates.status === "active") {
    await db.update(aiModels).set({ status: "testing" }).where(eq(aiModels.status, "active"));
  }

  const allowed: Record<string, unknown> = { updatedAt: new Date() };
  if (updates.name !== undefined)         allowed.name         = updates.name;
  if (updates.provider !== undefined)     allowed.provider     = updates.provider;
  if (updates.modelId !== undefined)      allowed.modelId      = updates.modelId;
  if (updates.customPrompt !== undefined) allowed.customPrompt = updates.customPrompt;
  if (updates.status !== undefined)       allowed.status       = updates.status;
  if (updates.paperOnly !== undefined)    allowed.paperOnly    = String(updates.paperOnly);
  if (updates.notes !== undefined)        allowed.notes        = updates.notes;

  const [updated] = await db.update(aiModels).set(allowed).where(eq(aiModels.id, id)).returning();
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await req.json();
  const [model] = await db.select().from(aiModels).where(eq(aiModels.id, id)).limit(1);
  if (model?.status === "active") return NextResponse.json({ error: "Cannot delete the active model" }, { status: 400 });
  await db.delete(aiModels).where(eq(aiModels.id, id));
  return NextResponse.json({ success: true });
}
