/** Fetch wrapper: JSON, CSRF double-submit header, cookie credentials. */
let csrfToken: string | null = null;

async function ensureCsrf(): Promise<string> {
  if (csrfToken) return csrfToken;
  await fetch("/api/auth/csrf", { credentials: "include" });
  csrfToken =
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("csrf="))
      ?.split("=")[1] ?? null;
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

  const res = await fetch(`/api${path}`, {
    method,
    headers,
    credentials: "include",
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 204) return undefined as T;
  const contentType = res.headers.get("content-type") ?? "";
  const data = contentType.includes("json") ? await res.json() : await res.text();
  if (!res.ok) {
    const err = typeof data === "object" && data && "error" in data ? data : { error: `HTTP ${res.status}` };
    throw new ApiError(res.status, (err as { error: string }).error, (err as { details?: unknown }).details);
  }
  return data as T;
}

export async function download(path: string): Promise<{ blob: Blob; filename: string }> {
  const res = await fetch(`/api${path}`, { credentials: "include" });
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
