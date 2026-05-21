// Privacy-preserving IP hashing for the hosted-tier rate limiter.
//
// The hashed IP is the KV key used for per-IP rate limiting. We never store
// the raw IP. The salt rotates on demand (annually, or on any suspected leak)
// by changing the IP_HASH_SALT secret; rotation invalidates all existing
// rate-limit counters, which is acceptable since they expire daily anyway.

const encoder = new TextEncoder();

async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashIp(rawIp, salt) {
  if (!salt) {
    throw new Error("IP_HASH_SALT is required.");
  }
  if (!rawIp) {
    return "unknown";
  }
  return await hmacSha256Hex(salt, rawIp);
}

export function utcDateKey(now = new Date()) {
  // YYYY-MM-DD in UTC. Used as the date suffix for rate-limit / budget keys.
  return now.toISOString().slice(0, 10);
}
