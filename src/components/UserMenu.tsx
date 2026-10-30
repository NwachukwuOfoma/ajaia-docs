"use client";

import { useRouter } from "next/navigation";
import type { User } from "@/lib/auth";
import { api, initials } from "@/lib/client";

export default function UserMenu({ user }: { user: User }) {
  const router = useRouter();
  async function signOut() {
    await api("/api/session", { method: "DELETE" }).catch(() => {});
    router.replace("/login");
    router.refresh();
  }
  return (
    <div className="user-menu">
      <span className="avatar" title={user.email} aria-hidden>{initials(user.name)}</span>
      <span className="user-menu-name">{user.name}</span>
      <button className="btn btn-quiet" onClick={signOut}>Switch user</button>
    </div>
  );
}
