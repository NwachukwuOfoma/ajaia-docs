import mammoth from "mammoth";
import { marked } from "marked";
import { AppError, badRequest } from "./errors";
import { sanitizeContent } from "./sanitize";

/**
 * File import: turns an uploaded .txt, .md or .docx file into editor HTML.
 * The result always goes through the same sanitizer as editor saves, so an
 * imported file can't carry scripts or styles into a shared document.
 */

export const SUPPORTED_EXTENSIONS = [".txt", ".md", ".docx"] as const;
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4 MB (Vercel caps request bodies at 4.5 MB)

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

/** Plain text: blank lines separate paragraphs, single newlines become <br>. */
export function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export async function markdownToHtml(md: string): Promise<string> {
  return marked.parse(md, { gfm: true, breaks: false });
}

export async function docxToHtml(buf: Buffer): Promise<string> {
  try {
    const { value } = await mammoth.convertToHtml({ buffer: buf });
    return value;
  } catch {
    throw badRequest("Couldn't read that .docx file. Is it a valid Word document?");
  }
}

/** Derives a document title from the file name ("Q3 plan.docx" -> "Q3 plan"). */
export function titleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim();
  return (base || "Imported document").slice(0, 200);
}

export async function fileToHtml(filename: string, buf: Buffer): Promise<string> {
  if (buf.byteLength === 0) throw badRequest("That file is empty");
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError(413, "Files must be 4 MB or smaller");
  }
  const ext = extensionOf(filename);
  let html: string;
  switch (ext) {
    case ".txt":
      html = textToHtml(buf.toString("utf8"));
      break;
    case ".md":
      html = await markdownToHtml(buf.toString("utf8"));
      break;
    case ".docx":
      html = await docxToHtml(buf);
      break;
    default:
      throw new AppError(
        415,
        `Unsupported file type${ext ? ` "${ext}"` : ""}. Upload a .txt, .md, or .docx file.`,
      );
  }
  // Drop newline-only gaps between tags (marked separates blocks with "\n"),
  // which the editor would otherwise turn into stray empty paragraphs.
  return sanitizeContent(html).replace(/>\s*\n\s*</g, "><").trim();
}
