/**
 * API collection responses are allowed to be either the collection itself or
 * an object containing the collection. Keep that shape difference at the
 * network boundary so UI code can safely use array methods.
 */
export function collectionResponse<T>(
  value: unknown,
  keys: readonly string[] = ["data", "items", "results"],
  depth = 0,
): T[] {
  if (Array.isArray(value)) return value as T[];
  if (!value || typeof value !== "object" || depth > 2) return [];

  const source = value as Record<string, unknown>;
  for (const key of keys) {
    const candidate = source[key];
    if (Array.isArray(candidate)) return candidate as T[];
    const nested = collectionResponse<T>(candidate, keys, depth + 1);
    if (nested.length > 0) return nested;
  }

  return [];
}
