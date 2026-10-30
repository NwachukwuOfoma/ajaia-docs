# AI workflow note

> **Draft. Edit this into your own words before submitting.** It records what actually happened in the build session with Claude so you have accurate material to work from. Add anything you change, review, or reject yourself afterwards.

## Tools used

- **Claude (Opus 5.5) in the Claude app**, with a cloud workspace that could run code. It wrote the code, installed packages, ran the build and tests, and drove the running app in a headless browser.
- **Playwright** (headless Chromium) to click through the real UI and take screenshots.
- **Vitest** for automated tests.

## Where AI materially sped things up

- **Scaffolding and boilerplate:** project config, route handlers, the CSS system and the share dialog took minutes rather than an hour or more.
- **Library glue:** TipTap 3's API (`useEditorState`, StarterKit config), mammoth for `.docx`, and libSQL for local vs Turso.
- **Test cases:** enumerating the permission matrix (owner/editor/viewer/outsider × read/edit/share/delete) and turning it into tests.
- **Fast verification loops:** a scripted browser walkthrough of the whole two-user flow could be re-run after every fix.

## What was changed or rejected

- **Scope decisions were made up front, not left to the generator.** The stack (Next.js + TipTap + SQLite) and the deploy target were chosen first. Real-time co-editing was explicitly ruled out in favor of version-based conflict detection (see ARCHITECTURE.md).
- **Rejected a client-side workaround in the documents list.** The first draft fetched the current user's ID from `/api/session` inside each "Remove" button. That was replaced by passing the ID down from the server component.
- **Rejected an ORM.** Drizzle was considered, but four tables read more clearly as plain SQL, especially the single access-control query.
- **Chose to fail loudly on misconfigured deploys.** Without `DATABASE_URL` on Vercel the app would have quietly written to an ephemeral file and lost data; now it throws a clear error.
- **Upload limit lowered from 5 MB to 4 MB** after checking Vercel's 4.5 MB request-body cap.

## Bugs caught by verification (not by reading the code)

The browser walkthrough found two real UX bugs that type-checking and unit tests didn't:

1. **Keystrokes lost after clicking a toolbar button.** Clicking *Bold* moved focus to the button, and the editor only refocused a frame later, so fast typing after a click dropped characters. Fixed by preventing the default on mousedown in the toolbar so focus never leaves the document.
2. **"Insert from file" mangled the current line.** With the cursor at the start of a heading, inserted content merged into it, turning the heading into a paragraph and leaving empty blocks behind. Fixed by inserting imported content as new blocks *below* the current paragraph, and stripping the newline-only whitespace between Markdown blocks that created empty paragraphs. A unit test now guards the whitespace case.

## How correctness, UX and reliability were verified

- **Unit/integration tests** (`npm test`, 16 tests) against a real SQLite database (in-memory) rather than mocks, so the SQL and the permission rules are tested together.
- **API checks with curl** against the production build: unauthenticated and forged-cookie requests get 401, outsiders get 404, a viewer's write gets 403, a stale save gets 409, an unsupported upload gets 415, and malformed JSON gets 400.
- **Scripted browser walkthrough** of the production build: format text → autosave → reload → check the HTML; import; share; switch to Bob and Carol; force a conflict; revoke access. It also checked for page errors.
- **Screenshot review** of every screen at desktop and phone widths (`docs/screenshots/`).
- `npm run typecheck` and `npm run build` pass cleanly.
