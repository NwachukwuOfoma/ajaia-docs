"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocumentDetail, DocumentSummary } from "@/lib/documents";
import { api, initials, timeAgo } from "@/lib/client";

const ACCEPT = ".txt,.md,.docx";

export default function DocumentList({
  userId,
  owned,
  shared,
}: {
  userId: string;
  owned: DocumentSummary[];
  shared: DocumentSummary[];
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"create" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createDoc() {
    setBusy("create");
    setError(null);
    try {
      const { document } = await api<{ document: DocumentDetail }>("/api/documents", {
        method: "POST",
        body: "{}",
      });
      router.push(`/documents/${document.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function importFile(file: File) {
    setBusy("import");
    setError(null);
    const form = new FormData();
    form.append("file", file);
    try {
      const { document } = await api<{ document: DocumentDetail }>("/api/import", {
        method: "POST",
        body: form,
      });
      router.push(`/documents/${document.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function deleteDoc(doc: DocumentSummary) {
    if (!confirm(`Delete "${doc.title}"? People it's shared with will lose access too.`)) return;
    setError(null);
    try {
      await api(`/api/documents/${doc.id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function leaveDoc(doc: DocumentSummary) {
    if (!confirm(`Remove "${doc.title}" from your list? You'll need ${doc.ownerName} to share it again.`)) return;
    try {
      await api(`/api/documents/${doc.id}/shares/${userId}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <main className="home">
      <div className="home-head">
        <h1>Documents</h1>
        <div className="home-actions">
          <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
            {busy === "import" ? "Importing…" : "Import file"}
          </button>
          <button className="btn btn-primary" onClick={createDoc} disabled={busy !== null}>
            {busy === "create" ? "Creating…" : "New document"}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ACCEPT}
            className="visually-hidden"
            aria-label="Import a .txt, .md or .docx file"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
            }}
          />
        </div>
      </div>
      <p className="hint" style={{ marginTop: -16, marginBottom: 24 }}>
        Import turns a .txt, .md or .docx file (up to 4 MB) into a new document you can edit.
      </p>
      {error && <p className="error-text" role="alert" style={{ marginBottom: 20 }}>{error}</p>}

      <section className="shelf" aria-labelledby="mine">
        <h2 id="mine">My documents</h2>
        <p className="hint">Documents you own. Only you can share or delete them.</p>
        {owned.length === 0 ? (
          <div className="empty">
            <p>Nothing here yet. Start a new document or import a file to get going.</p>
          </div>
        ) : (
          <ul className="doc-list">
            {owned.map((d) => (
              <li className="doc-row" key={d.id}>
                <Link className="doc-link" href={`/documents/${d.id}`}>
                  <span className="doc-title">{d.title}</span>
                  <span className="doc-meta">
                    <span>Edited {timeAgo(d.updatedAt)}</span>
                    {d.sourceName && <span>Imported from {d.sourceName}</span>}
                  </span>
                </Link>
                <button className="btn btn-quiet btn-danger" onClick={() => deleteDoc(d)} aria-label={`Delete ${d.title}`}>
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="shelf" aria-labelledby="shared">
        <h2 id="shared">Shared with me</h2>
        <p className="hint">Documents other people have given you access to.</p>
        {shared.length === 0 ? (
          <div className="empty">
            <p>No one has shared a document with you yet. Shared documents show up here with their owner and your access level.</p>
          </div>
        ) : (
          <ul className="doc-list">
            {shared.map((d) => (
              <li className="doc-row" key={d.id}>
                <Link className="doc-link" href={`/documents/${d.id}`}>
                  <span className="doc-title">{d.title}</span>
                  <span className="doc-meta">
                    <span className="from">
                      <span className="avatar avatar-sm" aria-hidden>{initials(d.ownerName)}</span>
                      {d.ownerName}
                    </span>
                    <span className={`role-tag ${d.role}`}>{d.role === "editor" ? "Can edit" : "Can view"}</span>
                    <span>Edited {timeAgo(d.updatedAt)}</span>
                  </span>
                </Link>
                <button className="btn btn-quiet" onClick={() => leaveDoc(d)} aria-label={`Remove ${d.title} from my list`}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
