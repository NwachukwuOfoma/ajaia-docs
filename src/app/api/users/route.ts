import { NextResponse } from "next/server";
import { listUsers, requireUser } from "@/lib/auth";
import { handle } from "@/lib/errors";

export const runtime = "nodejs";

/** Directory of users, used by the share dialog's picker. */
export const GET = handle(async () => {
  const me = await requireUser();
  const users = (await listUsers()).filter((u) => u.id !== me.id);
  return NextResponse.json({ users });
});
