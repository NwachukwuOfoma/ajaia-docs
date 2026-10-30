# Ajaia Docs

A lightweight collaborative document editor: create and format documents, import files, and share them with teammates as editors or viewers.

**Live demo:** _add your deployment URL here_
**Walkthrough video:** see `VIDEO_URL.txt`

## Test accounts

There are no passwords. The sign-in page lists three seeded accounts; click one to sign in, and use **Switch user** (top right) to see the other side of a share.

| Name | Email |
| --- | --- |
| Alice Johnson | alice@ajaia.test |
| Bob Martinez | bob@ajaia.test |
| Carol Chen | carol@ajaia.test |

**A 2-minute review path**

1. Sign in as **Alice**. Click **New document**, type a heading, some **bold**/*italic*/underlined text and a list, then rename it in the title field. The status next to the title reads "Saved just now". Refresh the page; everything is still there.
2. Click **Share**. Add `bob@ajaia.test` as **Can edit** and `carol@ajaia.test` as **Can view**.
3. **Switch user** to **Bob**. The document appears under **Shared with me** with Alice as the owner and a "Can edit" tag. Open it and make an edit.
4. **Switch user** to **Carol**. She can read the document but not edit it: there's no toolbar, the text is locked, and a banner explains why.
5. Back as Alice, use **Import file** on the documents page (or **Insert from file** in the editor) with a `.txt`, `.md` or `.docx` file. Sample files are in [`samples/`](samples/).

## What's included

- **Editing:** TipTap (ProseMirror) rich text with headings 1–3, bold, italic, underline, strikethrough, bulleted and numbered lists, quotes, undo/redo and keyboard shortcuts. Renaming happens inline.
- **Autosave:** saves 0.8 s after you stop typing (Ctrl/⌘+S saves immediately). The status shows saving, saved and error states, the page warns before you leave with unsaved changes, and transient failures retry automatically.
- **File import** (`.txt`, `.md`, `.docx`, up to 4 MB):
  - *Import file* creates a new document titled after the file.
  - *Insert from file* adds the file's content below the cursor in the open document.
  - Other file types are rejected with a clear message. The supported types are stated in the UI.
- **Sharing:**
  - Every document has an owner, who can grant **editor** or **viewer** access by email, change a role, or remove someone.
  - Collaborators can remove a shared document from their own list.
  - The documents page splits *My documents* from *Shared with me* and shows the owner and access level.
- **Access control:** enforced on the server for every request.
  - Users without access get a 404 (the response doesn't reveal that the document exists).
  - Viewers get a 403 on writes.
  - Only owners can share or delete.
- **Conflict safety:** each save carries the version it was based on. If someone else saved in between, the server returns 409, and the editor shows a banner with *Copy my text* / *Reload latest* instead of silently overwriting their work.
- **Persistence:** SQLite via libSQL. Locally that's a file; in production it's Turso (hosted SQLite, free tier). Content is stored as sanitized HTML, so formatting round-trips exactly.

## Run locally

Requires Node 20+.

```bash
npm install
cp .env.example .env.local   # optional: defaults work out of the box
npm run dev                  # http://localhost:3000
```

The database (`data/app.db`) and the seeded users are created automatically on the first request. To start fresh, delete the `data/` folder.

```bash
npm test          # Vitest: access control, sharing, versioning, sanitization, import
npm run typecheck
npm run build && npm start   # production build
```

## Deploy (free: Vercel + Turso)

Vercel's filesystem doesn't persist, so production uses a hosted SQLite database from Turso. The code is identical; only `DATABASE_URL` changes.

1. **Create the database** (free account at [turso.tech](https://turso.tech)):
   ```bash
   brew install tursodatabase/tap/turso   # or: curl -sSfL https://get.tur.so/install.sh | bash
   turso auth signup
   turso db create ajaia-docs
   turso db show ajaia-docs --url          # -> libsql://ajaia-docs-<you>.turso.io
   turso db tokens create ajaia-docs       # -> auth token
   ```
2. **Deploy:** push this folder to GitHub and import it at [vercel.com/new](https://vercel.com/new). Framework detection picks Next.js automatically.
3. **Add environment variables** in Vercel → Settings → Environment Variables:
   - `DATABASE_URL` = the `libsql://…` URL
   - `DATABASE_AUTH_TOKEN` = the token
   - `SESSION_SECRET` = any long random string (`openssl rand -base64 32`)
4. **Redeploy.** The tables and test accounts are created on the first request.

If `DATABASE_URL` is missing on Vercel, the app fails with an explicit error rather than quietly writing to a throwaway file.

*Alternative:* any host with a persistent disk (Railway, Fly.io, a VM) can run `npm run build && npm start` with the default local SQLite file and no Turso account.

## Project layout

```
src/
  app/
    api/               Route handlers (thin: parse input, call the service, return JSON)
      session/         mock sign-in / sign-out
      documents/       list, create, get, update, delete; [id]/shares for sharing
      import/          file upload → new document, or → HTML for "Insert from file"
      users/           directory for the share dialog
    login/  documents/[id]/  page.tsx    Server-rendered pages
  components/          DocEditor (autosave), Toolbar, ShareDialog, DocumentList, …
  lib/
    documents.ts       ← all access rules and document logic live here
    db.ts              libSQL client, schema, seed users
    auth.ts            signed-cookie mock auth
    import.ts          .txt/.md/.docx → sanitized HTML
    sanitize.ts        HTML allowlist shared by saves and imports
tests/                 Vitest suites against an in-memory database
```

More detail on decisions and tradeoffs is in [ARCHITECTURE.md](ARCHITECTURE.md); how AI was used is in [AI_WORKFLOW.md](AI_WORKFLOW.md).
