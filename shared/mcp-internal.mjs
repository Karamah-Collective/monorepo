const encoder = new TextEncoder();

function base64Url(bytes) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function decodeBase64Url(value) {
  const padded = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function hmacKey(secret, usage = ["sign", "verify"]) {
  if (!secret || String(secret).length < 32) return null;
  return crypto.subtle.importKey("raw", encoder.encode(String(secret)), { name: "HMAC", hash: "SHA-256" }, false, usage);
}

export async function signMcpAssertion(payload, secret) {
  const key = await hmacKey(secret, ["sign"]);
  if (!key) throw new Error("MCP internal signing is not configured");
  const body = base64Url(encoder.encode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 })));
  const signature = base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(body))));
  return `${body}.${signature}`;
}

export async function verifyMcpAssertion(assertion, secret) {
  const key = await hmacKey(secret, ["verify"]);
  const [body, signature] = String(assertion || "").split(".");
  if (!key || !body || !signature) return null;
  let valid = false;
  try { valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(signature), encoder.encode(body)); } catch { return null; }
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(body)));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (!payload.uid || !payload.email || !Array.isArray(payload.permissions)) return null;
    return payload;
  } catch { return null; }
}

export function mcpActorFromAssertion(payload) {
  return payload ? { uid: payload.uid, email: payload.email, name: payload.name || "" } : null;
}
