import { redirect } from "next/navigation";
import { getCurrentUser, listUsers } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const users = await listUsers();
  return (
    <main className="login">
      <div className="login-sheet">
        <span className="brand">
          <span className="brand-mark" aria-hidden /> Ajaia Docs
        </span>
        <h1>Sign in</h1>
        <p>This demo uses test accounts instead of passwords. Pick one, then sign in as another to see sharing from the other side.</p>
        <LoginForm users={users} />
      </div>
    </main>
  );
}
