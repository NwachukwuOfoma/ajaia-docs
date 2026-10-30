import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { unshareDocument } from "@/lib/documents";
import { handle } from "@/lib/errors";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; userId: string }> };

/** Owner removes someone, or a collaborator removes themselves. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id, userId } = await params;
  await unshareDocument(user.id, id, userId);
  return NextResponse.json({ ok: true });
});
