import { createClient, type Client } from "@libsql/client";
import fs from "node:fs";
import path from "node:path";

/**
 * Database access.
 *
 * libSQL lets the same code talk to a local SQLite file (development, tests)
 * or a hosted Turso database (production on serverless hosts, where the
 * filesystem is not persistent). The schema is created and seeded lazily on
 * first use so there is no separate migration step to forget during deploys.
 */

export const SEED_USERS = [
  { id: "u_alice", email: "alice@ajaia.test", name: "Alice Johnson" },
  { id: "u_bob", email: "bob@ajaia.test", name: "Bob Martinez" },
  { id: "u_carol", email: "carol@ajaia.test", name: "Carol Chen" },
] as const;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS documents (
     id TEXT PRIMARY KEY,
     owner_id TEXT NOT NULL REFERENCES users(id),
     title TEXT NOT NULL,
     content TEXT NOT NULL DEFAULT '',
     source_name TEXT,
     version INTEGER NOT NULL DEFAULT 1,
     created_at TEXT NOT NULL,
     updated_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id)`,
  `CREATE TABLE IF NOT EXISTS document_shares (
     document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
     user_id TEXT NOT NULL REFERENCES users(id),
     role TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
     created_at TEXT NOT NULL,
     PRIMARY KEY (document_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id)`,
];

function resolveUrl(): string {
  if (!process.env.DATABASE_URL && process.env.VERCEL) {
    // Serverless filesystems are read-only/ephemeral: a local file would lose data.
    throw new Error("DATABASE_URL is not set. On Vercel, point it at a Turso database (see README).");
  }
  const url = process.env.DATABASE_URL || "file:./data/app.db";
  if (url.startsWith("file:")) {
    const filePath = url.slice("file:".length);
    fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  }
  return url;
}

// Cache across hot reloads in dev and across requests in a warm serverless instance.
const globalForDb = globalThis as unknown as {
  __dbClient?: Client;
  __dbReady?: Promise<Client>;
};

async function init(): Promise<Client> {
  const client = createClient({
    url: resolveUrl(),
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  await client.execute("PRAGMA foreign_keys = ON");
  await client.batch(SCHEMA, "write");
  await client.batch(
    SEED_USERS.map((u) => ({
      sql: "INSERT OR IGNORE INTO users (id, email, name) VALUES (?, ?, ?)",
      args: [u.id, u.email, u.name],
    })),
    "write",
  );
  globalForDb.__dbClient = client;
  return client;
}

export function getDb(): Promise<Client> {
  if (!globalForDb.__dbReady) {
    globalForDb.__dbReady = init().catch((err) => {
      // Allow a retry on the next request instead of caching the failure forever.
      globalForDb.__dbReady = undefined;
      throw err;
    });
  }
  return globalForDb.__dbReady;
}

/** Test helper: drop the cached client so each test file starts clean. */
export function resetDbForTests() {
  globalForDb.__dbClient?.close();
  globalForDb.__dbClient = undefined;
  globalForDb.__dbReady = undefined;
}
