import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDocument, type DocumentDetail } from "@/lib/documents";
import { AppError } from "@/lib/errors";
import DocEditor from "@/components/DocEditor";

export const dynamic = "force-dynamic";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  let doc: DocumentDetail;
  try {
    doc = await getDocument(user.id, id);
  } catch (e) {
    if (e instanceof AppError && e.status === 404) {
      return (
        <main className="notice">
          <h1>This document isn&apos;t available</h1>
          <p>
            It may have been deleted, or it hasn&apos;t been shared with {user.email}. Ask the owner
            to share it with you, or switch to the account that has access.
          </p>
          <Link className="btn" href="/">Back to documents</Link>
        </main>
      );
    }
    throw e;
  }

  return <DocEditor initial={doc} user={user} />;
}
