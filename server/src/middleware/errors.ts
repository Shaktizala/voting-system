import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/errors";
import { isTransientDbError } from "../db";

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: "Validation failed",
      details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  if (err instanceof HttpError) {
    const body: any = { error: err.message, code: err.code };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }
  if (isTransientDbError(err)) {
    // overload, not a bug: tell clients it is safe to retry (vote submission is idempotent)
    console.warn("[db] transient failure:", (err as Error).message.split("\n")[0]);
    res.setHeader("Retry-After", "1");
    return res.status(503).json({ error: "The server is busy. Try again in a moment", code: "RETRY" });
  }
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
}
