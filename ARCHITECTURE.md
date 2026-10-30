# Architecture note

## What I optimized for

The brief asks for depth over breadth, so I picked the parts a real team would notice in a first week of use and made those solid:

1. **Editing that never loses work.** That means autosave with clear status, a warning before you navigate away with unsaved changes, retry on network errors, and, most importantly, **no silent overwrites** when two people edit the same document.
2. **Access control that's actually enforced.** Every rule lives in one server module and is covered by tests. It isn't a UI that just hides buttons.
3. **Import that produces a usable document**, not a blob attachment.

What I deliberately did **not** build is listed at the bottom.

## Stack and why

| Choice | Why |
| --- | --- |
| **Next.js (App Router), TypeScript** | One repo and one deploy for UI + API. Server components read the database directly for first paint; route handlers serve the client's mutations. |
| **TipTap 3 (ProseMirror)** | Mature, schema-based rich text. The schema guarantees the document only contains supported structures, and it gives undo/redo, shortcuts and list behavior for free. |
| **SQLite via libSQL** | Zero setup locally (a file is created on first run). In production the *same client* talks to Turso (hosted SQLite, free tier), which suits serverless hosts with no persistent disk. Raw SQL instead of an ORM: four tables don't need one, and it keeps the access query easy to read. |
| **Plain CSS, system fonts** | No build-time font fetches or CSS framework to configure. The visual identity comes from the "paper on a desk" layout and a book serif for document text. |

## Data model

```
users            (id, email, name)                         -- seeded: Alice, Bob, Carol
documents        (id, owner_id, title, content, source_name, version, created_at, updated_at)
document_shares  (document_id, user_id, role: viewer|editor, created_at)   PK(document_id, user_id)
```

- **Ownership is a column, not a share row.** A document always has exactly one owner, so "owned vs shared" is a simple comparison.
- **Content is stored as HTML**, sanitized on every write against the same small tag allowlist the editor can produce. I chose HTML over ProseMirror JSON for three reasons. It round-trips formatting exactly. File imports already produce HTML. And the stored content stays readable and portable, for example for a future export. The tradeoff is that HTML is a weaker contract than JSON, which is why sanitization is mandatory and tested.
- **`version` is an integer** bumped on every save, for optimistic concurrency (below).

## Access control

`src/lib/documents.ts` is the only place permissions are decided. Route handlers authenticate, parse input, and call it. A single SQL query resolves the caller's role (`owner` / `editor` / `viewer` / none) by joining the share table.

| | owner | editor | viewer | no access |
|---|---|---|---|---|
| read | ✓ | ✓ | ✓ | 404 |
| edit / rename | ✓ | ✓ | 403 | 404 |
| share, change roles, remove people | ✓ | 403 | 403 | 404 |
| delete | ✓ | 403 | 403 | 404 |
| remove self from a shared doc | n/a | ✓ | ✓ | 404 |

A caller with no access gets **404, not 403**, so the response doesn't confirm that a given document ID exists.

## Saving and concurrency

The editor collects changes into a pending patch and sends at most one request at a time, 800 ms after typing stops. Each request includes `baseVersion`. The server runs `UPDATE … WHERE id = ? AND version = ?`; if no row matches, someone else saved first and it returns **409**. The editor then stops autosaving and shows *Copy my text* / *Reload latest*.

This is a deliberate middle ground. Real-time co-editing (CRDTs/OT with Yjs, presence, a websocket server) is the "right" answer for Google Docs, but it's a multi-day project and needs a stateful server, which doesn't fit free serverless hosting. Last-write-wins would have been simpler but silently destroys a collaborator's work, which is the worst failure for a shared editor. Conflict detection is honest and cheap, and it leaves a clean upgrade path.

## Import

`POST /api/import` accepts one file (`.txt`, `.md`, `.docx`, ≤ 4 MB, Vercel's request cap is 4.5 MB) and converts it on the server:

- `.txt`: blank lines become paragraphs and single newlines become line breaks; the text is HTML-escaped.
- `.md`: converted with `marked` (GFM).
- `.docx`: converted with `mammoth`, which maps Word styles (headings, bold, lists) to semantic HTML and drops visual-only formatting.

The output goes through the same sanitizer as editor saves, so a Markdown file containing `<script>` can't plant XSS in a document someone else will open. The endpoint has two modes: create a new document titled after the file, or return HTML that the editor inserts **as new blocks below the cursor's paragraph**. That way imported text never merges into, and reformats, the line you're on.

## Auth

This is mock auth, as the brief allows. The sign-in page lists seeded users. The session cookie is `userId.HMAC(userId)`, `httpOnly`, so it can't be edited in devtools to impersonate someone. It's isolated in `src/lib/auth.ts` (`getCurrentUser` / `requireUser`), so swapping in a real provider wouldn't touch the document logic.

## Validation and error handling

- Titles are trimmed and whitespace-collapsed; empty titles and titles over 200 characters are rejected. Content over 1 MB is rejected.
- Share requests validate the email, the role, and that the recipient exists and isn't the owner.
- All API errors return `{ error }` JSON with a correct status code and a sentence the UI shows as-is. Unexpected errors are logged and return a generic 500.
- The UI covers empty states, a page explaining "this document isn't available" for revoked or unknown documents, inline share errors, and upload errors.

## Testing

`npm test` runs 16 Vitest tests against a fresh in-memory database per test. They cover:

- the create → rename → edit → reopen round-trip with formatting intact
- owned vs shared listing
- 404 for outsiders, editor vs viewer permissions, role changes and revocation
- cascade on delete
- the 409 stale-save path
- XSS stripping
- .txt/.md/.docx conversion and unsupported-type errors

I also drove the built app through a headless-browser script covering the full flow (formatting, autosave, reload, import, sharing, the other users' views, a conflict, and revocation). It isn't in the repo because it needs Playwright's browsers; the screenshots in `docs/screenshots/` come from that run.

## Deliberately deprioritized

- **Real-time co-editing and presence.** Replaced with conflict detection; see above.
- **Real authentication**: passwords, OAuth, invitations for people without an account.
- **Images, tables, links UI, comments, version history.** Link *rendering* and autolinking work; there's no "insert link" button.
- **Search, folders, pagination** of the document list.
- **Export.** Content is stored as HTML, so Markdown/PDF export is a small addition.

## With another 2–4 hours

1. **Version history** (the most valuable stretch item for a shared editor): snapshot content on save, at most once per few minutes, and add a "Restore" list. The `version` column is already there.
2. **Export to Markdown/PDF** from stored HTML.
3. **Playwright e2e tests in CI** (the script already exists) and a GitHub Actions workflow running typecheck, unit and e2e tests.
4. **Live update notice:** poll the document's `version` every ~10 s while it's open, and offer "Bob made changes, reload" *before* the user hits a conflict.
