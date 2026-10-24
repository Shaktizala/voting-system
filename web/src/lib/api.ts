/** Fetch wrapper: JSON, CSRF double-submit header, cookie credentials. */
let csrfToken: string | null = null;

const readCsrfCookie = () =>
  document.cookie
    .split("; ")
    .find((c) => c.startsWith("csrf="))
    ?.split("=")[1] ?? null;

async function ensureCsrf(): Promise<string> {
  // the cookie survives reloads; only bootstrap it over the network when missing
  csrfToken ??= readCsrfCookie();
  if (csrfToken) return csrfToken;
  try {
    await fetch("/api/auth/csrf", { credentials: "include" });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection");
  }
  csrfToken = readCsrfCookie();
  return csrfToken ?? "";
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<T> {
  const method = options.method ?? (options.body ? "POST" : "GET");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET") headers["X-CSRF-Token"] = await ensureCsrf();

  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers,
      credentials: "include",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // offline / Wi-Fi drop / server restarting
    throw new ApiError(0, "Can't reach the server. Check your connection");
  }

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err = typeof data === "object" && data && "error" in data ? data : { error: `HTTP ${res.status}` };
    throw new ApiError(res.status, (err as { error: string }).error, (err as { details?: unknown }).details);
  }
  return data as T;
}

/**
 * Worth retrying automatically: network failures, rate limiting and server
 * overload. Validation/permission errors (4xx) are final.
 */
export function isRetryable(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 0 || e.status === 429 || e.status >= 500);
}

/** Exponential backoff with jitter so a whole room doesn't retry in lockstep. */
export const retryDelay = (attempt: number) => Math.min(1000 * 2 ** attempt, 8000) + Math.random() * 600;

export async function download(path: string, body?: unknown): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    ...(body !== undefined
      ? { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": await ensureCsrf() }, body: JSON.stringify(body) }
      : {}),
  });
  if (!res.ok) throw new ApiError(res.status, `Download failed (HTTP ${res.status})`);
  const dispo = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(dispo);
  return { blob: await res.blob(), filename: match?.[1] ?? "download" };
}

/** Multipart uploads send their own request shape. */
export async function upload(path: string, file: File, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.append("file", file);
  for (const [k, v] of Object.entries(extra)) form.append(k, v);
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "X-CSRF-Token": await ensureCsrf() },
    credentials: "include",
    body: form,
  });
  const data = await res.json();
  if (!res.ok) throw new ApiError(res.status, data.error, data.details);
  return data;
}
