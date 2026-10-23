export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, "BAD_REQUEST", details);
export const unauthorized = (msg = "Authentication required") => new HttpError(401, msg, "UNAUTHORIZED");
export const forbidden = (msg = "You don't have permission to do that") => new HttpError(403, msg, "FORBIDDEN");
export const notFound = (msg = "Not found") => new HttpError(404, msg, "NOT_FOUND");
export const conflict = (msg: string, details?: unknown) => new HttpError(409, msg, "CONFLICT");
export const tooMany = (msg = "Too many attempts, try again later") => new HttpError(429, msg, "RATE_LIMITED");
