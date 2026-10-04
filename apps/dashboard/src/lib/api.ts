const DEFAULT_WORKER_API_BASE = "https://api.payetonhook.l92-labs.com";
const apiBase = import.meta.env.VITE_API_BASE ?? DEFAULT_WORKER_API_BASE;
let csrfToken: string | null = null;

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    credentials: "include",
    ...options
  });
  const nextCsrf = response.headers.get("x-csrf-token");
  if (nextCsrf) {
    csrfToken = nextCsrf;
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(body || `API error ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function getApiBase(): string {
  return apiBase;
}

export function getCsrfToken(): string | null {
  return csrfToken;
}

function csrfHeaders(): HeadersInit {
  const token = getCsrfToken();
  return token ? { "x-csrf-token": token } : {};
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>(path);
}

export function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...csrfHeaders()
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

export function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      ...csrfHeaders()
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

export function apiDelete<T>(path: string): Promise<T> {
  return request<T>(path, {
    method: "DELETE",
    headers: csrfHeaders()
  });
}
