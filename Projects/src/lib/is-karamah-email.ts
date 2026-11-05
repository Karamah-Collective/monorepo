export function isKaramahEmail(email?: string | null) {
  const normalized = email?.trim().toLowerCase() || "";
  return (
    normalized.endsWith("@karamahcollective.com") ||
    normalized.endsWith("@karamah.local")
  );
}
