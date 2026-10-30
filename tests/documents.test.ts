import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/lib/db";
import {
  createDocument,
  deleteDocument,
  getDocument,
  listDocuments,
  listShares,
  shareDocument,
  unshareDocument,
  updateDocument,
} from "@/lib/documents";
import { AppError } from "@/lib/errors";

// Seeded users (see src/lib/db.ts)
const ALICE = "u_alice";
const BOB = "u_bob";
const CAROL = "u_carol";

/** Asserts the promise rejects with an AppError carrying this HTTP status. */
async function expectStatus(p: Promise<unknown>, status: number) {
  const err = await p.then(
    () => null,
    (e) => e,
  );
  expect(err, `expected a ${status} error`).toBeInstanceOf(AppError);
  expect((err as AppError).status).toBe(status);
}

beforeEach(async () => {
  resetDbForTests(); // fresh in-memory database for every test
  await getDb();
});
afterAll(() => resetDbForTests());

describe("document lifecycle", () => {
  it("creates, renames, edits and reopens a document with formatting intact", async () => {
    const doc = await createDocument(ALICE);
    expect(doc.title).toBe("Untitled document");
    expect(doc.role).toBe("owner");

    const html = "<h1>Plan</h1><p><strong>Bold</strong> <em>it</em> <u>under</u></p><ul><li>one</li></ul>";
    await updateDocument(ALICE, doc.id, { title: "  Q3   plan ", content: html, baseVersion: 1 });

    const reopened = await getDocument(ALICE, doc.id);
    expect(reopened.title).toBe("Q3 plan"); // whitespace normalized
    expect(reopened.content).toBe(html); // formatting preserved
    expect(reopened.version).toBe(2);
  });

  it("validates titles", async () => {
    const doc = await createDocument(ALICE);
    await expectStatus(updateDocument(ALICE, doc.id, { title: "   " }), 400);
    await expectStatus(updateDocument(ALICE, doc.id, { title: "x".repeat(201) }), 400);
  });

  it("strips scripts and event handlers from saved content", async () => {
    const doc = await createDocument(ALICE, {
      content: '<p onclick="steal()">Hi</p><script>alert(1)</script><a href="javascript:x()">link</a>',
    });
    expect(doc.content).not.toMatch(/script|onclick|javascript:/);
    expect(doc.content).toContain("<p>Hi</p>");
  });

  it("rejects a stale save instead of overwriting newer work", async () => {
    const doc = await createDocument(ALICE);
    await shareDocument(ALICE, doc.id, { email: "bob@ajaia.test", role: "editor" });

    // Both load version 1; Bob saves first.
    await updateDocument(BOB, doc.id, { content: "<p>Bob's edit</p>", baseVersion: 1 });
    await expectStatus(
      updateDocument(ALICE, doc.id, { content: "<p>Alice's edit</p>", baseVersion: 1 }),
      409,
    );
    expect((await getDocument(ALICE, doc.id)).content).toBe("<p>Bob's edit</p>");
  });
});

describe("sharing and access control", () => {
  it("separates owned and shared documents in each user's list", async () => {
    const doc = await createDocument(ALICE, { title: "Roadmap" });
    await shareDocument(ALICE, doc.id, { email: "BOB@ajaia.test", role: "viewer" });

    const alice = await listDocuments(ALICE);
    expect(alice.owned.map((d) => d.id)).toEqual([doc.id]);
    expect(alice.shared).toEqual([]);

    const bob = await listDocuments(BOB);
    expect(bob.owned).toEqual([]);
    expect(bob.shared).toMatchObject([{ id: doc.id, role: "viewer", ownerName: "Alice Johnson" }]);

    expect(await listDocuments(CAROL)).toEqual({ owned: [], shared: [] });
  });

  it("hides documents from users without access (404, not 403)", async () => {
    const doc = await createDocument(ALICE);
    await expectStatus(getDocument(CAROL, doc.id), 404);
    await expectStatus(updateDocument(CAROL, doc.id, { content: "<p>x</p>" }), 404);
  });

  it("lets editors edit but not share or delete", async () => {
    const doc = await createDocument(ALICE);
    await shareDocument(ALICE, doc.id, { email: "bob@ajaia.test", role: "editor" });

    const saved = await updateDocument(BOB, doc.id, { title: "Bob renamed it" });
    expect(saved.title).toBe("Bob renamed it");

    await expectStatus(shareDocument(BOB, doc.id, { email: "carol@ajaia.test" }), 403);
    await expectStatus(deleteDocument(BOB, doc.id), 403);
  });

  it("keeps viewers read-only", async () => {
    const doc = await createDocument(ALICE);
    await shareDocument(ALICE, doc.id, { email: "bob@ajaia.test", role: "viewer" });
    expect((await getDocument(BOB, doc.id)).role).toBe("viewer");
    await expectStatus(updateDocument(BOB, doc.id, { content: "<p>nope</p>" }), 403);
  });

  it("changes a role by sharing again, and revokes access", async () => {
    const doc = await createDocument(ALICE);
    await shareDocument(ALICE, doc.id, { email: "bob@ajaia.test", role: "viewer" });
    const shares = await shareDocument(ALICE, doc.id, { email: "bob@ajaia.test", role: "editor" });
    expect(shares).toMatchObject([{ userId: BOB, role: "editor" }]);

    await unshareDocument(ALICE, doc.id, BOB);
    expect(await listShares(ALICE, doc.id)).toEqual([]);
    await expectStatus(getDocument(BOB, doc.id), 404);
  });

  it("validates share requests", async () => {
    const doc = await createDocument(ALICE);
    await expectStatus(shareDocument(ALICE, doc.id, { email: "" }), 400);
    await expectStatus(shareDocument(ALICE, doc.id, { email: "nobody@ajaia.test" }), 404);
    await expectStatus(shareDocument(ALICE, doc.id, { email: "alice@ajaia.test" }), 400);
    await expectStatus(shareDocument(ALICE, doc.id, { email: "bob@ajaia.test", role: "admin" }), 400);
  });

  it("deleting a document removes it for collaborators too", async () => {
    const doc = await createDocument(ALICE);
    await shareDocument(ALICE, doc.id, { email: "bob@ajaia.test" });
    await deleteDocument(ALICE, doc.id);
    expect((await listDocuments(BOB)).shared).toEqual([]);
  });
});
