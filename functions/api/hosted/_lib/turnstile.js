// Cloudflare Turnstile verification.
//
// Turnstile is the privacy-preserving captcha alternative used in front of
// the hosted tier. We never use Google reCAPTCHA. The token comes from the
// frontend; we verify it server-side using the secret stored as a Pages
// secret.

export async function verifyTurnstile(token, secret, remoteIp) {
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is required.");
  }
  if (!token) {
    return { ok: false, reason: "missing-token" };
  }
  const formData = new FormData();
  formData.append("secret", secret);
  formData.append("response", token);
  if (remoteIp) formData.append("remoteip", remoteIp);

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    { method: "POST", body: formData }
  );

  if (!response.ok) {
    return { ok: false, reason: `turnstile-http-${response.status}` };
  }

  const data = await response.json();
  if (data.success) return { ok: true };
  return { ok: false, reason: (data["error-codes"] || []).join(",") || "unknown" };
}
