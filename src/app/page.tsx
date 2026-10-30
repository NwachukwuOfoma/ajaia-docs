import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { listDocuments } from "@/lib/documents";
import UserMenu from "@/components/UserMenu";
import DocumentList from "@/components/DocumentList";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { owned, shared } = await listDocuments(user.id);

  return (
    <>
      <header className="appbar">
        <Link href="/" className="brand">
          <span className="brand-mark" aria-hidden /> Ajaia Docs
        </Link>
        <span className="appbar-spacer" />
        <UserMenu user={user} />
      </header>
      <DocumentList userId={user.id} owned={owned} shared={shared} />
    </>
  );
}
