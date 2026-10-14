import { ADMIN_ORIGIN, auth } from "../firebase.js";

const adminOrigin = (import.meta.env.VITE_ADMIN_ORIGIN || ADMIN_ORIGIN).replace(/\/+$/, "");

function adminEndpoint(): string {
  if (import.meta.env.DEV) return "/api/admin";
  return new URL("/api/admin", adminOrigin).toString();
}

export type AdminRequest = {
  action: string;
  query?: Record<string, unknown>;
  body?: Record<string, unknown>;
  method?: "GET" | "POST";
};

export async function requestAdmin({
  action,
  query = {},
  body = {},
  method = "GET",
}: AdminRequest): Promise<Response> {
  const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
  const url = new URL(adminEndpoint(), window.location.origin);
  const headers: HeadersInit = {
    Accept: "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  if (method === "GET") {
    url.searchParams.set("action", action);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
    return fetch(url, { headers, credentials: "include" });
  }

  return fetch(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ action, ...body }),
  });
}

export async function requestAdminJson<T>({
  action,
  query,
  body,
  method,
}: AdminRequest): Promise<T> {
  const response = await requestAdmin({ action, query, body, method });
  let payload: T & { error?: string; status?: number };
  try {
    payload = (await response.json()) as T & { error?: string; status?: number };
  } catch {
    throw new Error("The Admin service returned an invalid response.");
  }
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.error || "The Admin service rejected the request.");
    Object.assign(error, { status: response.status || payload?.status || 500 });
    throw error;
  }
  return payload;
}

