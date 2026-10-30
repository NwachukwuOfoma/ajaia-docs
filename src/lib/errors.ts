import { NextResponse } from "next/server";

/** An error that is safe to show to the user, with the HTTP status to send. */
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Document") => new AppError(404, `${what} not found`);
export const forbidden = (msg = "You don't have permission to do that") =>
  new AppError(403, msg);
export const badRequest = (msg: string) => new AppError(400, msg);

/** Wraps a route handler so thrown AppErrors become JSON responses. */
export function handle<A extends unknown[]>(
  fn: (...args: A) => Promise<Response>,
) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof AppError) {
        return NextResponse.json(
          { error: err.message, code: err.code },
          { status: err.status },
        );
      }
      console.error(err);
      return NextResponse.json(
        { error: "Something went wrong. Please try again." },
        { status: 500 },
      );
    }
  };
}
