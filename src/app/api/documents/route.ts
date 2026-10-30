import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createDocument, listDocuments } from "@/lib/documents";
import { handle } from "@/lib/errors";

export const runtime = "nodejs";

export const GET = handle(async () => {
  const user = await requireUser();
  return NextResponse.json(await listDocuments(user.id));
});

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const body = (await req.json().catch(() => ({}))) ?? {};
  const doc = await createDocument(user.id, { title: body.title, content: body.content });
  return NextResponse.json({ document: doc }, { status: 201 });
});
