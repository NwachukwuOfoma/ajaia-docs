"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/auth";
import { api, initials } from "@/lib/client";

export default function LoginForm({ users }: { users: User[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(userId: string) {
    setPending(userId);
    setError(null);
    try {
      await api("/api/session", { method: "POST", body: JSON.stringify({ userId }) });
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPending(null);
    }
  }

  return (
    <>
      <ul className="account-list">
        {users.map((u) => (
          <li key={u.id}>
            <button className="account" onClick={() => signIn(u.id)} disabled={pending !== null}>
              <span className="avatar">{initials(u.name)}</span>
              <span className="account-text">
                <span className="account-name">
                  {pending === u.id ? `Signing in as ${u.name.split(" ")[0]}…` : u.name}
                </span>
                <span className="account-email">{u.email}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="error-text" role="alert">{error}</p>}
    </>
  );
}
