"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { User } from "@/lib/auth";
import type { DocumentDetail } from "@/lib/documents";
import { api, ApiError, timeAgo } from "@/lib/client";
import Toolbar from "./Toolbar";
import ShareDialog from "./ShareDialog";
import UserMenu from "./UserMenu";

type Status = "saved" | "dirty" | "saving" | "error" | "conflict";
type Pending = { title?: string; content?: string };

const AUTOSAVE_DELAY_MS = 800;
const RETRY_DELAY_MS = 4000;

export default function DocEditor({ initial, user }: { initial: DocumentDetail; user: User }) {
  const canEdit = initial.role !== "viewer";
  const isOwner = initial.role === "owner";

  const [title, setTitle] = useState(initial.title);
  const savedTitle = useRef(initial.title);
  const [status, setStatus] = useState<Status>("saved");
  const [savedAt, setSavedAt] = useState(initial.updatedAt);
  const [error, setError] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  // Save pipeline: changes accumulate in `pending`; at most one request is in
  // flight; each request sends the version it was based on so the server can
  // reject a save that would overwrite someone else's newer work.
  const version = useRef(initial.version);
  const pending = useRef<Pending>({});
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);

  const save = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (stopped.current || inFlight.current) return;
    const changes = pending.current;
    if (changes.title === undefined && changes.content === undefined) return;

    pending.current = {};
    inFlight.current = true;
    setStatus("saving");
    try {
      const { document } = await api<{ document: DocumentDetail }>(`/api/documents/${initial.id}`, {
        method: "PATCH",
        body: JSON.stringify({ ...changes, baseVersion: version.current }),
      });
      version.current = document.version;
      savedTitle.current = document.title;
      setSavedAt(document.updatedAt);
      setError(null);
      const more = pending.current.title !== undefined || pending.current.content !== undefined;
      setStatus(more ? "dirty" : "saved");
      if (more) timer.current = setTimeout(save, AUTOSAVE_DELAY_MS);
    } catch (e) {
      // Put the unsent changes back, keeping anything newer typed meanwhile.
      pending.current = { ...changes, ...pending.current };
      const err = e as ApiError;
      if (err.status === 409) {
        stopped.current = true;
        setStatus("conflict");
        setError(err.message);
      } else if (err.status === 400 || err.status === 403 || err.status === 404 || err.status === 413) {
        stopped.current = err.status !== 400; // a bad title is fixable; lost access is not
        if (err.status === 400 && changes.title !== undefined) {
          setTitle(savedTitle.current);
          delete pending.current.title;
        }
        setStatus("error");
        setError(err.message);
      } else {
        setStatus("error");
        setError(`${err.message} Retrying…`);
        timer.current = setTimeout(save, RETRY_DELAY_MS);
      }
    } finally {
      inFlight.current = false;
    }
  }, [initial.id]);

  const queue = useCallback(
    (changes: Pending, delay = AUTOSAVE_DELAY_MS) => {
      if (stopped.current) return;
      pending.current = { ...pending.current, ...changes };
      setStatus((s) => (s === "saving" ? s : "dirty"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(save, delay);
    },
    [save],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: !canEdit, autolink: true },
      }),
    ],
    content: initial.content,
    editable: canEdit,
    immediatelyRender: false, // avoid SSR hydration mismatch
    editorProps: {
      attributes: { "aria-label": "Document body", spellcheck: "true" },
    },
    onUpdate: ({ editor: e }) => queue({ content: e.getHTML() }),
  });

  function commitTitle() {
    const next = title.replace(/\s+/g, " ").trim();
    if (!next) {
      setTitle(savedTitle.current);
      return;
    }
    if (next !== title) setTitle(next);
    if (next !== savedTitle.current) queue({ title: next }, 0);
  }

  async function insertFromFile(file: File) {
    if (!editor) return;
    setImporting(true);
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const { html } = await api<{ html: string }>("/api/import?mode=convert", { method: "POST", body: form });
      // Insert as whole blocks below the paragraph the cursor is in, so the
      // imported text never merges into (and reformats) the user's current line.
      // An empty paragraph at the cursor is replaced instead of left behind.
      const { $from } = editor.state.selection;
      const block = $from.depth >= 1 ? $from.node(1) : null;
      const target = !block
        ? editor.state.doc.content.size
        : block.type.name === "paragraph" && block.content.size === 0
          ? { from: $from.before(1), to: $from.after(1) }
          : $from.after(1);
      editor.chain().focus().insertContentAt(target, html).scrollIntoView().run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setImporting(false);
    }
  }

  // Ctrl/Cmd+S saves immediately instead of opening the browser's save dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  // Warn before leaving with unsaved work.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (status === "dirty" || status === "saving" || status === "error" || status === "conflict") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [status]);

  // Flush on unmount (e.g. clicking "All documents").
  useEffect(() => () => void save(), [save]);

  // Keep "Saved 2 minutes ago" fresh.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const statusText = !canEdit
    ? `Last edited ${timeAgo(savedAt)}`
    : {
        saved: `Saved ${timeAgo(savedAt)}`,
        dirty: "Unsaved changes",
        saving: "Saving…",
        error: "Not saved",
        conflict: "Not saved",
      }[status];

  async function copyMyVersion() {
    if (!editor) return;
    await navigator.clipboard.writeText(editor.getText()).catch(() => {});
  }

  return (
    <div className="editor-shell">
      <header className="editor-bar">
        <div className="editor-bar-top">
          <Link href="/" className="btn btn-quiet" aria-label="All documents" title="All documents">
            ← <span className="visually-hidden">All documents</span>
          </Link>
          <label htmlFor="doc-title" className="visually-hidden">Document title</label>
          <input
            id="doc-title"
            className="title-input"
            value={title}
            readOnly={!canEdit}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                (e.target as HTMLInputElement).blur();
                editor?.commands.focus();
              }
              if (e.key === "Escape") {
                setTitle(savedTitle.current);
                (e.target as HTMLInputElement).blur();
              }
            }}
          />
          <span
            className={`save-status${status === "error" || status === "conflict" ? " is-error" : ""}`}
            role="status"
            aria-live="polite"
          >
            {statusText}
          </span>
          <span className="appbar-spacer" />
          <button className={`btn${isOwner ? " btn-primary" : ""}`} onClick={() => setShareOpen(true)}>
            {isOwner ? "Share" : "People"}
          </button>
          <UserMenu user={user} />
        </div>
        {canEdit && editor && <Toolbar editor={editor} onImport={insertFromFile} importing={importing} />}
        {!canEdit && (
          <p className="banner banner-info">
            You have view-only access. Ask {initial.ownerName} for edit access if you need to make changes.
          </p>
        )}
        {status === "conflict" && (
          <p className="banner banner-error" role="alert">
            {error}
            <button className="btn" onClick={copyMyVersion}>Copy my text</button>
            <button className="btn" onClick={() => window.location.reload()}>Reload latest</button>
          </p>
        )}
        {status !== "conflict" && error && (
          <p className="banner banner-error" role="alert">{error}</p>
        )}
      </header>

      <div className="desk">
        <article className="page prose">
          {editor ? <EditorContent editor={editor} /> : <div dangerouslySetInnerHTML={{ __html: initial.content }} />}
        </article>
      </div>

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        docId={initial.id}
        docTitle={title}
        isOwner={isOwner}
        owner={{ name: initial.ownerName, isMe: isOwner }}
      />
    </div>
  );
}
