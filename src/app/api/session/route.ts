import { NextResponse } from "next/server";
import { SESSION_COOKIE, getUserById, getCurrentUser, signSession } from "@/lib/auth";
import { AppError, badRequest, handle } from "@/lib/errors";

export const runtime = "nodejs";

/** Who am I? */
export const GET = handle(async () => {
  const user = await getCurrentUser();
  if (!user) throw new AppError(401, "Not signed in");
  return NextResponse.json({ user });
});

/** Sign in as one of the seeded users (mock auth). */
export const POST = handle(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const userId = body?.userId;
  if (typeof userId !== "string" || !userId) throw badRequest("Choose a user to sign in as");
  const user = await getUserById(userId);
  if (!user) throw badRequest("Unknown user");

  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, signSession(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
});

/** Sign out. */
export const DELETE = handle(async () => {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
