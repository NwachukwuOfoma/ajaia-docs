import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { deleteDocument, getDocument, updateDocument } from "@/lib/documents";
import { badRequest, handle } from "@/lib/errors";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  return NextResponse.json({ document: await getDocument(user.id, id) });
});

/** Body: { title?, content?, baseVersion } */
export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") throw badRequest("Expected a JSON body");
  const doc = await updateDocument(user.id, id, body);
  return NextResponse.json({ document: doc });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const user = await requireUser();
  const { id } = await params;
  await deleteDocument(user.id, id);
  return NextResponse.json({ ok: true });
});
