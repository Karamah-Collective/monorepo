import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { verifyFirebaseIdToken } from "../shared/firebase-verify.mjs";

const cryptoApi = globalThis.crypto || webcrypto;
if (!globalThis.crypto) globalThis.crypto = cryptoApi;
const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");

test("Firebase verification accepts a complete identity token over the old 2048-byte cutoff", async () => {
  const keys = await cryptoApi.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicJwk = await cryptoApi.subtle.exportKey("jwk", keys.publicKey);
  publicJwk.kid = "test-kid";
  const now = Math.floor(Date.now() / 1000);
  const header = encode({ alg: "RS256", kid: "test-kid", typ: "JWT" });
  const payload = encode({
    aud: "halal-map-karamah",
    iss: "https://securetoken.google.com/halal-map-karamah",
    sub: "aram-test-uid",
    email: "aram@karamahcollective.com",
    email_verified: true,
    iat: now,
    auth_time: now,
    exp: now + 3600,
    firebase: { sign_in_provider: "google.com" },
    identityClaims: "x".repeat(1800),
  });
  const signingInput = `${header}.${payload}`;
  const signature = await cryptoApi.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keys.privateKey,
    new TextEncoder().encode(signingInput),
  );
  const token = `${signingInput}.${Buffer.from(signature).toString("base64url")}`;
  assert.ok(token.length > 2048);

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [publicJwk] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  try {
    const verified = await verifyFirebaseIdToken(token);
    assert.equal(verified.uid, "aram-test-uid");
    assert.equal(verified.email, "aram@karamahcollective.com");
    assert.equal(verified.signInProvider, "google.com");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
