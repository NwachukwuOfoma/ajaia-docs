# Submission: Ajaia Docs

**Live app:** https://ajaia-docs-iota-three.vercel.app  
**Source code:** https://github.com/NwachukwuOfoma/ajaia-docs
**Walkthrough video:** see `VIDEO_URL.txt`
**Test accounts:** no passwords. Pick Alice, Bob or Carol on the sign-in page (`alice@ajaia.test`, `bob@ajaia.test`, `carol@ajaia.test`) and use **Switch user** to test sharing.

## What's in this folder

| Item | Where |
| --- | --- |
| Source code | `src/` (app, API routes, components, lib), `tests/`, config files |
| Setup, run and deploy instructions | `README.md` |
| Architecture note | `ARCHITECTURE.md` |
| AI workflow note | `AI_WORKFLOW.md` |
| Walkthrough video link | `VIDEO_URL.txt` |
| Screenshots of every main screen | `docs/screenshots/` |
| Sample files to test import | `samples/` (`.md`, `.txt`, `.docx`) |
| Automated tests | `tests/` (run `npm test`) |

`node_modules/`, `.next/` and the local database are not included; `npm install` restores them, and the database is created on first run.

## Status

**Working end to end**

- Create, rename, edit with rich text (headings, bold, italic, underline, strikethrough, bulleted and numbered lists, quotes), autosave, and reopen with formatting preserved
- Import `.txt` / `.md` / `.docx` as a new document, or insert a file into an open draft
- Sharing by email with editor or viewer roles; change a role; remove access; collaborators can remove a doc from their list
- *My documents* and *Shared with me* shown separately, with the owner and access level
- Server-enforced permissions; conflict detection for simultaneous edits
- Persistence in SQLite (local file) or Turso (production)
- 16 automated tests; typecheck and production build pass

**Stretch item included:** role-based sharing permissions (viewer vs editor).

**Intentionally not built:** real-time co-editing and presence (replaced by conflict detection), real authentication, images and tables, comments, version history, export. ARCHITECTURE.md explains why.

**Next 2–4 hours:** version history with restore, Markdown/PDF export, Playwright e2e in CI, and a "someone else edited this" notice before a conflict happens.
