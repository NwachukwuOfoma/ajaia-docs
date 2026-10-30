import crypto from "node:crypto";
import type { Row } from "@libsql/client";
import { getDb } from "./db";
import { AppError, badRequest, forbidden, notFound } from "./errors";
import { sanitizeContent } from "./sanitize";

/**
 * Document service: the single place that decides who can do what.
 * API routes stay thin and call these functions; tests exercise them directly.
 *
 * Access model
 *   owner  – read, edit, rename, share, unshare, delete
 *   editor – read, edit, rename
 *   viewer – read only
 */

export type Role = "owner" | "editor" | "viewer";
export type ShareRole = Exclude<Role, "owner">;

export const MAX_TITLE_LENGTH = 200;
export const MAX_CONTENT_BYTES = 1_000_000; // ~1 MB of HTML is far beyond a normal doc

export type DocumentSummary = {
  id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  role: Role;
  updatedAt: string;
  sourceName: string | null;
};

export type DocumentDetail = DocumentSummary & {
  content: string;
  version: number;
  createdAt: string;
};

export type Share = { userId: string; name: string; email: string; role: ShareRole };

const now = () => new Date().toISOString();
const newId = () => "d_" + crypto.randomBytes(9).toString("base64url");

function toSummary(r: Row): DocumentSummary {
  return {
    id: String(r.id),
    title: String(r.title),
    ownerId: String(r.owner_id),
    ownerName: String(r.owner_name),
    role: r.role as Role,
    updatedAt: String(r.updated_at),
    sourceName: r.source_name == null ? null : String(r.source_name),
  };
}

export function normalizeTitle(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("Title must be text");
  const title = raw.replace(/\s+/g, " ").trim();
  if (!title) throw badRequest("Title can't be empty");
  if (title.length > MAX_TITLE_LENGTH) {
    throw badRequest(`Title must be ${MAX_TITLE_LENGTH} characters or fewer`);
  }
  return title;
}

function normalizeContent(raw: unknown): string {
  if (typeof raw !== "string") throw badRequest("Content must be HTML text");
  if (Buffer.byteLength(raw) > MAX_CONTENT_BYTES) {
    throw new AppError(413, "This document is too large to save");
  }
  return sanitizeContent(raw);
}

// One query that resolves the caller's role for a document (or nothing).
const ACCESS_SQL = `
  SELECT d.*, u.name AS owner_name,
         CASE WHEN d.owner_id = :uid THEN 'owner' ELSE s.role END AS role
  FROM documents d
  JOIN users u ON u.id = d.owner_id
  LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = :uid
  WHERE d.id = :id AND (d.owner_id = :uid OR s.user_id IS NOT NULL)`;

/** Returns the document if the user can see it; 404 otherwise (don't leak existence). */
export async function getDocument(userId: string, id: string): Promise<DocumentDetail> {
  const db = await getDb();
  const res = await db.execute({ sql: ACCESS_SQL, args: { uid: userId, id } });
  const r = res.rows[0];
  if (!r) throw notFound();
  return {
    ...toSummary(r),
    content: String(r.content),
    version: Number(r.version),
    createdAt: String(r.created_at),
  };
}

export async function listDocuments(userId: string) {
  const db = await getDb();
  const res = await db.execute({
    sql: `
      SELECT d.id, d.title, d.owner_id, d.updated_at, d.source_name, u.name AS owner_name,
             CASE WHEN d.owner_id = :uid THEN 'owner' ELSE s.role END AS role
      FROM documents d
      JOIN users u ON u.id = d.owner_id
      LEFT JOIN document_shares s ON s.document_id = d.id AND s.user_id = :uid
      WHERE d.owner_id = :uid OR s.user_id IS NOT NULL
      ORDER BY d.updated_at DESC`,
    args: { uid: userId },
  });
  const docs = res.rows.map(toSummary);
  return {
    owned: docs.filter((d) => d.role === "owner"),
    shared: docs.filter((d) => d.role !== "owner"),
  };
}

export async function createDocument(
  userId: string,
  input: { title?: unknown; content?: unknown; sourceName?: string | null } = {},
): Promise<DocumentDetail> {
  const title = input.title === undefined ? "Untitled document" : normalizeTitle(input.title);
  const content = input.content === undefined ? "" : normalizeContent(input.content);
  const id = newId();
  const ts = now();
  const db = await getDb();
  await db.execute({
    sql: `INSERT INTO documents (id, owner_id, title, content, source_name, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
    args: [id, userId, title, content, input.sourceName ?? null, ts, ts],
  });
  return getDocument(userId, id);
}

/**
 * Updates title and/or content. `baseVersion` is the version the client
 * last loaded; if someone else saved in between we return 409 instead of
 * silently overwriting their work (optimistic concurrency).
 */
export async function updateDocument(
  userId: string,
  id: string,
  input: { title?: unknown; content?: unknown; baseVersion?: unknown },
): Promise<DocumentDetail> {
  const doc = await getDocument(userId, id);
  if (doc.role === "viewer") throw forbidden("You have view-only access to this document");
  if (input.title === undefined && input.content === undefined) {
    throw badRequest("Nothing to update");
  }
  const title = input.title === undefined ? doc.title : normalizeTitle(input.title);
  const content = input.content === undefined ? doc.content : normalizeContent(input.content);

  const base = input.baseVersion === undefined ? doc.version : Number(input.baseVersion);
  if (!Number.isInteger(base)) throw badRequest("baseVersion must be an integer");

  const db = await getDb();
  const res = await db.execute({
    sql: `UPDATE documents SET title = ?, content = ?, version = version + 1, updated_at = ?
          WHERE id = ? AND version = ?`,
    args: [title, content, now(), id, base],
  });
  if (res.rowsAffected === 0) {
    throw new AppError(
      409,
      "This document was changed by someone else. Reload to get the latest version.",
      "version_conflict",
    );
  }
  return getDocument(userId, id);
}

export async function deleteDocument(userId: string, id: string): Promise<void> {
  const doc = await getDocument(userId, id);
  if (doc.role !== "owner") throw forbidden("Only the owner can delete this document");
  const db = await getDb();
  await db.batch(
    [
      { sql: "DELETE FROM document_shares WHERE document_id = ?", args: [id] },
      { sql: "DELETE FROM documents WHERE id = ?", args: [id] },
    ],
    "write",
  );
}

export async function listShares(userId: string, id: string): Promise<Share[]> {
  await getDocument(userId, id); // anyone with access can see who else has access
  const db = await getDb();
  const res = await db.execute({
    sql: `SELECT s.user_id, s.role, u.name, u.email FROM document_shares s
          JOIN users u ON u.id = s.user_id WHERE s.document_id = ? ORDER BY u.name`,
    args: [id],
  });
  return res.rows.map((r) => ({
    userId: String(r.user_id),
    name: String(r.name),
    email: String(r.email),
    role: r.role as ShareRole,
  }));
}

/** Grants (or changes) access for another user, looked up by email. */
export async function shareDocument(
  userId: string,
  id: string,
  input: { email?: unknown; role?: unknown },
): Promise<Share[]> {
  const doc = await getDocument(userId, id);
  if (doc.role !== "owner") throw forbidden("Only the owner can share this document");

  const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!email) throw badRequest("Enter an email address to share with");
  const role = input.role ?? "editor";
  if (role !== "viewer" && role !== "editor") throw badRequest("Role must be viewer or editor");

  const db = await getDb();
  const found = await db.execute({ sql: "SELECT id FROM users WHERE lower(email) = ?", args: [email] });
  const target = found.rows[0];
  if (!target) throw new AppError(404, `No user with the email ${email}`);
  if (String(target.id) === doc.ownerId) throw badRequest("You already own this document");

  await db.execute({
    sql: `INSERT INTO document_shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
    args: [id, String(target.id), role, now()],
  });
  return listShares(userId, id);
}

export async function unshareDocument(userId: string, id: string, targetUserId: string) {
  const doc = await getDocument(userId, id);
  // Owners can remove anyone; a collaborator can remove themselves ("leave").
  if (doc.role !== "owner" && targetUserId !== userId) {
    throw forbidden("Only the owner can remove people");
  }
  const db = await getDb();
  await db.execute({
    sql: "DELETE FROM document_shares WHERE document_id = ? AND user_id = ?",
    args: [id, targetUserId],
  });
}
