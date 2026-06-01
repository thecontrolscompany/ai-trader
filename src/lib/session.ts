import { auth } from "@/auth";
import { NextResponse } from "next/server";

export async function getSessionUserId(): Promise<{ userId: string } | { error: NextResponse }> {
  const session = await auth();
  const userId = session?.user?.email;
  if (!userId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId };
}
