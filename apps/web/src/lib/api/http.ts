export class ApiClientError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

/** Formats an unknown thrown value into a UI-safe message. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiClientError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong";
}

/**
 * Maps Prisma entity types to their JSON wire shape (Date → ISO string,
 * Decimal → string via toJSON). Lets the web app share response types with
 * the API by importing Prisma types type-only (AC #4: shared Zod + Prisma types).
 */
export type Jsonify<T> = T extends Date
  ? string
  : T extends { toJSON(): infer R }
    ? R
    : T extends Array<infer U>
      ? Jsonify<U>[]
      : T extends object
        ? { [K in keyof T]: Jsonify<T[K]> }
        : T;

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  headers?: Record<string, string>;
}

export interface ApiClient {
  get<T>(path: string, opts?: RequestOptions): Promise<T>;
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>;
  delete<T>(path: string, opts?: RequestOptions): Promise<T>;
}

interface ErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}

export function createApiClient(
  baseUrl: string,
  defaultHeaders?: () => Record<string, string>,
): ApiClient {
  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    opts: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(`${baseUrl}${path}`, "http://placeholder.local");
    for (const [key, value] of Object.entries(opts.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    // Relative base (browser/proxy) keeps a relative URL; absolute base wins.
    const target = baseUrl.startsWith("http") ? url.toString() : `${url.pathname}${url.search}`;

    const res = await fetch(target, {
      method,
      cache: "no-store",
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...defaultHeaders?.(),
        ...opts.headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let payload: ErrorEnvelope = {};
      try {
        payload = (await res.json()) as ErrorEnvelope;
      } catch {
        // non-JSON error body — fall through to the generic message
      }
      throw new ApiClientError(
        res.status,
        payload.error?.code ?? "ERROR",
        payload.error?.message ?? `Request failed (${res.status})`,
        payload.error?.details,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  return {
    get: (path, opts) => request("GET", path, undefined, opts),
    post: (path, body, opts) => request("POST", path, body, opts),
    put: (path, body, opts) => request("PUT", path, body, opts),
    patch: (path, body, opts) => request("PATCH", path, body, opts),
    delete: (path, opts) => request("DELETE", path, undefined, opts),
  };
}
