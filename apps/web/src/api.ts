import type { SessionUser } from "@fatboy/shared";

let accessToken: string | null = null;
let refreshing: Promise<SessionUser | null> | null = null;

type RequestOptions = RequestInit & { retryAuth?: boolean };

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`/api${path}`, {
    ...options,
    headers,
    credentials: "include"
  });
  if (response.status === 401 && options.retryAuth !== false && path !== "/auth/refresh") {
    const user = await refreshSession();
    if (user) return request<T>(path, { ...options, retryAuth: false });
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? "No pudimos completar la operación");
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

export async function login(email: string, password: string) {
  const response = await request<{ accessToken: string; user: SessionUser }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
    retryAuth: false
  });
  accessToken = response.accessToken;
  return response.user;
}

export async function refreshSession(): Promise<SessionUser | null> {
  if (refreshing) return refreshing;
  refreshing = request<{ accessToken: string; user: SessionUser }>("/auth/refresh", {
    method: "POST",
    retryAuth: false
  })
    .then((response) => {
      accessToken = response.accessToken;
      return response.user;
    })
    .catch(() => {
      accessToken = null;
      return null;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

export async function logout() {
  await request("/auth/logout", { method: "POST", retryAuth: false }).catch(() => undefined);
  accessToken = null;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, idempotencyKey?: string) =>
    request<T>(path, {
      method: "POST",
      headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
      body: body === undefined ? undefined : JSON.stringify(body)
    }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  upload: <T>(path: string, image: File) => {
    const body = new FormData();
    body.set("image", image);
    return request<T>(path, { method: "POST", body });
  }
};
