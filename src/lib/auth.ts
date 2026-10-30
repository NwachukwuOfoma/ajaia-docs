import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getDb } from "./db";
import { AppError } from "./errors";

/**
 * Mock authentication: reviewers pick one of the seeded users on the login
 * page. The session cookie holds the user id plus an HMAC so it can't be
 * edited in devtools to impersonate someone else. There are no passwords;
 * swapping this module for a real provider would not touch the rest of the app.
 */

export const SESSION_COOKIE = "ajaia_session";

export type User = { id: string; email: string; name: string };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    console.warn("SESSION_SECRET is not set; using an insecure default.");
  }
  return s || "dev-only-insecure-secret";
}

export function signSession(userId: string): string {
  const mac = crypto.createHmac("sha256", secret()).update(userId).digest("base64url");
  return `${userId}.${mac}`;
}

export function verifySession(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const expected = Buffer.from(signSession(userId));
  const actual = Buffer.from(token);
  if (expected.length !== actual.length) return null;
  return crypto.timingSafeEqual(expected, actual) ? userId : null;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  const res = await db.execute({ sql: "SELECT id, email, name FROM users WHERE id = ?", args: [id] });
  const row = res.rows[0];
  return row ? { id: String(row.id), email: String(row.email), name: String(row.name) } : null;
}

export async function listUsers(): Promise<User[]> {
  const db = await getDb();
  const res = await db.execute("SELECT id, email, name FROM users ORDER BY name");
  return res.rows.map((r) => ({ id: String(r.id), email: String(r.email), name: String(r.name) }));
}

/** The signed-in user for the current request, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const jar = await cookies();
  const userId = verifySession(jar.get(SESSION_COOKIE)?.value);
  return userId ? getUserById(userId) : null;
}

/** Like getCurrentUser, but throws a 401 for API routes. */
export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) throw new AppError(401, "Please sign in");
  return user;
}
