import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createDocument } from "@/lib/documents";
import { badRequest, handle } from "@/lib/errors";
import { fileToHtml, titleFromFilename } from "@/lib/import";

export const runtime = "nodejs";

/**
 * Multipart upload with a single `file` field (.txt, .md, .docx).
 *   ?mode=create  (default) – creates a new document owned by the caller
 *   ?mode=convert           – returns sanitized HTML for inserting into an open draft
 */
export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const mode = new URL(req.url).searchParams.get("mode") ?? "create";
  if (mode !== "create" && mode !== "convert") throw badRequest("mode must be create or convert");

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || typeof file === "string") throw badRequest("Attach a file in the 'file' field");

  const html = await fileToHtml(file.name, Buffer.from(await file.arrayBuffer()));

  if (mode === "convert") return NextResponse.json({ html });

  const doc = await createDocument(user.id, {
    title: titleFromFilename(file.name),
    content: html,
    sourceName: file.name.slice(0, 255),
  });
  return NextResponse.json({ document: doc }, { status: 201 });
});
