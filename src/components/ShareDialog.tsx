"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@/lib/auth";
import type { Share, ShareRole } from "@/lib/documents";
import { api, initials } from "@/lib/client";

type Props = {
  open: boolean;
  onClose: () => void;
  docId: string;
  docTitle: string;
  isOwner: boolean;
  owner: { name: string; isMe: boolean };
};

export default function ShareDialog({ open, onClose, docId, docTitle, isOwner, owner }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [shares, setShares] = useState<Share[] | null>(null);
  const [directory, setDirectory] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotice(null);
    api<{ shares: Share[] }>(`/api/documents/${docId}/shares`)
      .then((r) => setShares(r.shares))
      .catch((e) => setError(e.message));
    if (isOwner) {
      api<{ users: User[] }>("/api/users")
        .then((r) => setDirectory(r.users))
        .catch(() => {});
    }
  }, [open, docId, isOwner]);

  async function share(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await api<{ shares: Share[] }>(`/api/documents/${docId}/shares`, {
        method: "POST",
        body: JSON.stringify({ email, role }),
      });
      setShares(r.shares);
      const who = r.shares.find((s) => s.email === email.trim().toLowerCase());
      setNotice(`Shared with ${who?.name ?? email}. It now appears in their "Shared with me" list.`);
      setEmail("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(s: Share, next: ShareRole) {
    setError(null);
    try {
      const r = await api<{ shares: Share[] }>(`/api/documents/${docId}/shares`, {
        method: "POST",
        body: JSON.stringify({ email: s.email, role: next }),
      });
      setShares(r.shares);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(s: Share) {
    setError(null);
    try {
      await api(`/api/documents/${docId}/shares/${s.userId}`, { method: "DELETE" });
      setShares((cur) => (cur ?? []).filter((x) => x.userId !== s.userId));
      setNotice(`Removed ${s.name}.`);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const sharedIds = new Set((shares ?? []).map((s) => s.userId));
  const suggestions = directory.filter((u) => !sharedIds.has(u.id));

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} aria-labelledby="share-title">
      <div className="dialog-body">
        <h2 id="share-title">{isOwner ? `Share “${docTitle}”` : "People with access"}</h2>
        <p className="hint">
          {isOwner
            ? "Editors can change the text and title. Viewers can only read. Only you can share or delete."
            : `${owner.name} owns this document and manages who can access it.`}
        </p>

        {isOwner && (
          <form className="share-form" onSubmit={share}>
            <label htmlFor="share-email" className="visually-hidden">Email address</label>
            <input
              id="share-email"
              className="input"
              type="email"
              required
              placeholder="Email, e.g. bob@ajaia.test"
              list="share-directory"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="off"
            />
            <datalist id="share-directory">
              {suggestions.map((u) => (
                <option key={u.id} value={u.email}>{u.name}</option>
              ))}
            </datalist>
            <label htmlFor="share-role" className="visually-hidden">Access level</label>
            <select id="share-role" className="select" value={role} onChange={(e) => setRole(e.target.value as ShareRole)}>
              <option value="editor">Can edit</option>
              <option value="viewer">Can view</option>
            </select>
            <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>
              {busy ? "Sharing…" : "Share"}
            </button>
          </form>
        )}
        {isOwner && suggestions.length > 0 && (
          <p className="hint" style={{ margin: "8px 0 0" }}>
            Test accounts: {suggestions.map((u) => u.email).join(", ")}
          </p>
        )}
        {error && <p className="error-text" role="alert">{error}</p>}
        {notice && !error && <p className="hint" role="status" style={{ margin: "8px 0 0" }}>{notice}</p>}

        <ul className="people">
          <li className="person">
            <span className="avatar">{initials(owner.name)}</span>
            <span className="person-text">
              <span className="person-name">{owner.name}{owner.isMe ? " (you)" : ""}</span>
            </span>
            <span className="hint">Owner</span>
          </li>
          {shares === null && !error && <li className="person hint">Loading…</li>}
          {(shares ?? []).map((s) => (
            <li className="person" key={s.userId}>
              <span className="avatar">{initials(s.name)}</span>
              <span className="person-text">
                <div className="person-name">{s.name}</div>
                <div className="person-email">{s.email}</div>
              </span>
              {isOwner ? (
                <>
                  <label className="visually-hidden" htmlFor={`role-${s.userId}`}>Access for {s.name}</label>
                  <select
                    id={`role-${s.userId}`}
                    className="select"
                    value={s.role}
                    onChange={(e) => changeRole(s, e.target.value as ShareRole)}
                  >
                    <option value="editor">Can edit</option>
                    <option value="viewer">Can view</option>
                  </select>
                  <button className="btn btn-quiet btn-danger" onClick={() => remove(s)} aria-label={`Remove ${s.name}`}>
                    Remove
                  </button>
                </>
              ) : (
                <span className="hint">{s.role === "editor" ? "Can edit" : "Can view"}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
      <div className="dialog-foot">
        <button className="btn" onClick={() => ref.current?.close()}>Done</button>
      </div>
    </dialog>
  );
}
