import { ADMIN_ORIGIN } from "../firebase.js";

export function getApiUrl(path: string) {
  const configuredBase = import.meta.env.VITE_API_URL ||
    (import.meta.env.DEV ? "/api" : ADMIN_ORIGIN);
  const trimmedBase = configuredBase.replace(/\/+$/, "");
  const apiUrl = trimmedBase.endsWith("/api")
    ? trimmedBase
    : `${trimmedBase}/api`;
  const normalizedPath = `/${path.replace(/^\/+/, "")}`;

  return `${apiUrl}${normalizedPath}`;
}
