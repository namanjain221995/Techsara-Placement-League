import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { issuesToDetails } from "../../src/shared/schemas";

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (code: string, message: string, details?: unknown) => new AppError(400, code, message, details);
export const notFound = (what = "Resource") => new AppError(404, "NOT_FOUND", `${what} not found.`);
export const conflict = (code: string, message: string, details?: unknown) => new AppError(409, code, message, details);
export const unauthorized = () => new AppError(401, "UNAUTHORIZED", "Please sign in.");
export const forbidden = (message = "Not allowed.") => new AppError(403, "FORBIDDEN", message);

/** Express 5 forwards rejected promises to this handler automatically. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Please fix the highlighted fields.", details: issuesToDetails(err) } });
    return;
  }
  const pgCode = (err as { code?: string })?.code;
  if (pgCode === "23505") {
    res.status(409).json({ error: { code: "DUPLICATE", message: "That value is already used (names and numbers must be unique)." } });
    return;
  }
  if ((err as { type?: string })?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "TOO_LARGE", message: "Request is too large." } });
    return;
  }
  console.error("[api] unexpected error:", err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong. The action was not applied." } });
}
