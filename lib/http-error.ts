import { NextResponse } from "next/server";

/** Thrown from handlers to map to HTTP status + JSON body without leaking stack traces. */
export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function logRouteError(route: string, err: unknown): void {
  console.error(`[${route}]`, err);
}

/** Safe JSON for unexpected failures (details logged server-side only). */
export function jsonUnexpected(route: string, err: unknown, status = 500) {
  logRouteError(route, err);
  return NextResponse.json(
    { error: status >= 500 ? "Something went wrong" : "Request could not be completed" },
    { status },
  );
}
