import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { HttpError } from "../utils/errors";

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
  console.error(err);
  return res.status(500).json({ error: "Internal server error" });
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
}
