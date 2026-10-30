import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { listShares, shareDocument } from "@/lib/documents";
import { handle } from "@/lib/errors";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  return NextResponse.json({ shares: await listShares(user.id, id) });
});

/** Body: { email, role: "viewer" | "editor" } — adds or updates access. */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) ?? {};
  const shares = await shareDocument(user.id, id, body);
  return NextResponse.json({ shares });
});
