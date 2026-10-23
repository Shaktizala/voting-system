import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { HttpError } from "../utils/errors";

/** Wraps async handlers so rejections reach the error middleware. */
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };

/** Parse & validate a request field with a zod schema. */
export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(400, "Validation failed", "VALIDATION", result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return result.data;
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, query: unknown): z.infer<T> {
  const result = schema.safeParse(query);
  if (!result.success) {
    throw new HttpError(400, "Invalid query", "VALIDATION", result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return result.data;
}

export function router(): Router {
  return Router({ mergeParams: true });
}
