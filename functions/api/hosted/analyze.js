// Hosted-tier entry point — Cloudflare Pages Function at /api/hosted/analyze.
//
// This is the ONLY hosted-tier endpoint. BYOK requests bypass this function
// entirely and go directly from the browser to the LLM provider.
//
// Seven safety layers (matched to workers/hosted-tier-spec.md):
//   L1. Provider-level monthly spend caps (set in provider dashboards)
//   L2. This function is the only proxy; BYOK does not touch it
//   L3. Per-IP daily rate limit via KV (hashed IP, TTL self-expires)
//   L4. Global daily community budget kill switch via KV
//   L5. Per-request input size cap
//   L6. Tier-aware model allowlist (cost-efficient models only)
//   L7. Cloudflare Turnstile bot resistance
//
// Privacy discipline:
//   - No request body or response stored
//   - No raw IPs stored — only HMAC-SHA256 hashes with rotating salt
//   - No user accounts, no auth header, no email
//   - KV keys self-expire on a daily TTL
//   - Function source is open source; privacy claims are verifiable

import { hashIp, utcDateKey } from "./_lib/ip-hash.js";
import { verifyTurnstile } from "./_lib/turnstile.js";
import {
  callProvider,
  ALLOWED_MODELS_DEFAULT,
  ESTIMATED_COST_CENTS,
  jsonResponse,
} from "./_lib/providers.js";

export async function onRequestPost(context) {
  const { request, env } = context;

  // Required bindings: KV namespace `SLOPCHECK_KV`, secrets `IP_HASH_SALT`,
  // `TURNSTILE_SECRET_KEY`, `SLOPCHECK_ANTHROPIC_KEY`, `SLOPCHECK_OPENAI_KEY`,
  // `SLOPCHECK_GOOGLE_KEY`. Env vars: `PER_IP_DAILY_LIMIT`, `GLOBAL_DAILY_BUDGET_USD`,
  // `MAX_INPUT_CHARS`, `ALLOWED_MODELS` (comma-separated).
  if (!env.SLOPCHECK_KV) {
    return jsonResponse({ error: "Hosted tier KV binding missing." }, 500);
  }

  const perIpDailyLimit = parseInt(env.PER_IP_DAILY_LIMIT || "5", 10);
  const globalDailyBudgetCents = Math.round(
    parseFloat(env.GLOBAL_DAILY_BUDGET_USD || "25") * 100
  );
  const maxInputChars = parseInt(env.MAX_INPUT_CHARS || "50000", 10);
  const allowedModels = (env.ALLOWED_MODELS
    ? env.ALLOWED_MODELS.split(",").map((s) => s.trim())
    : ALLOWED_MODELS_DEFAULT
  ).filter(Boolean);

  // Parse body.
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: "Invalid JSON body." }, 400);
  }
  const { provider, model, systemPrompt, userPrompt, maxTokens } = body || {};
  if (!provider || !model || !systemPrompt || !userPrompt) {
    return jsonResponse(
      { error: "provider, model, systemPrompt, userPrompt required." },
      400
    );
  }

  // L7 — Turnstile verification (with internal-proxy bypass for trusted Workers
  //       like the email-in Worker which can't produce a Turnstile token).
  const turnstileToken = request.headers.get("X-Turnstile-Token") || "";
  const internalProxyHeader = request.headers.get("X-Internal-Proxy-Key") || "";
  const remoteIp =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("X-Forwarded-For") ||
    "";
  const internalProxyOk =
    env.INTERNAL_PROXY_KEY &&
    internalProxyHeader &&
    internalProxyHeader === env.INTERNAL_PROXY_KEY;
  if (env.TURNSTILE_SECRET_KEY && !internalProxyOk) {
    const ts = await verifyTurnstile(turnstileToken, env.TURNSTILE_SECRET_KEY, remoteIp);
    if (!ts.ok) {
      return jsonResponse(
        { error: `Bot check failed (${ts.reason}). Refresh and try again.` },
        403
      );
    }
  }

  // L6 — model allowlist.
  if (!allowedModels.includes(model)) {
    return jsonResponse(
      {
        error:
          "Model not available on the hosted tier. Bring your own API key for frontier models.",
        allowed: allowedModels,
      },
      400
    );
  }

  // L5 — input size cap.
  const inputLength = (systemPrompt || "").length + (userPrompt || "").length;
  if (inputLength > maxInputChars) {
    return jsonResponse(
      {
        error: `Hosted-tier input exceeds ${maxInputChars.toLocaleString()} characters. Bring your own API key for longer documents, or install the skills locally.`,
        chars: inputLength,
        max: maxInputChars,
      },
      413
    );
  }

  // L4 — kill switch and L3 — per-IP rate limit. Both keyed by UTC day.
  const today = utcDateKey();
  const killSwitchKey = `killswitch:${today}`;
  const budgetKey = `budget:${today}`;

  const killSwitch = await env.SLOPCHECK_KV.get(killSwitchKey);
  if (killSwitch === "1") {
    return jsonResponse(
      {
        error:
          "Today's community budget is spent. Bring your own API key to continue, or come back tomorrow.",
      },
      429
    );
  }

  const hashedIp = await hashIp(remoteIp, env.IP_HASH_SALT);
  const rlKey = `rl:${hashedIp}:${today}`;
  const rlRaw = await env.SLOPCHECK_KV.get(rlKey);
  const rlCount = rlRaw ? parseInt(rlRaw, 10) : 0;
  if (rlCount >= perIpDailyLimit) {
    return jsonResponse(
      {
        error: `Daily personal limit reached (${perIpDailyLimit} analyses per IP per UTC day). Bring your own API key for unlimited use.`,
      },
      429
    );
  }

  // Proxy to the chosen provider using the dedicated slopcheck key.
  let providerText;
  try {
    providerText = await callProvider({
      provider,
      env,
      model,
      systemPrompt,
      userPrompt,
      maxTokens,
    });
  } catch (e) {
    return jsonResponse({ error: e.message }, 502);
  }

  // Update counters. The TTL is 90,000 sec (~25h) so the keys self-expire
  // shortly after the UTC day rolls over.
  const TTL_SECONDS = 90000;
  await env.SLOPCHECK_KV.put(rlKey, String(rlCount + 1), { expirationTtl: TTL_SECONDS });

  const costCents = ESTIMATED_COST_CENTS[model] || 10;
  const budgetRaw = await env.SLOPCHECK_KV.get(budgetKey);
  const budgetSoFar = budgetRaw ? parseInt(budgetRaw, 10) : 0;
  const newBudget = budgetSoFar + costCents;
  await env.SLOPCHECK_KV.put(budgetKey, String(newBudget), { expirationTtl: TTL_SECONDS });

  // L4 — flip the kill switch if budget hits 95% of ceiling.
  if (newBudget >= Math.round(globalDailyBudgetCents * 0.95)) {
    await env.SLOPCHECK_KV.put(killSwitchKey, "1", { expirationTtl: TTL_SECONDS });
  }

  return jsonResponse({ text: providerText });
}

// Reject anything other than POST.
export async function onRequest(context) {
  if (context.request.method === "POST") return onRequestPost(context);
  return jsonResponse({ error: "POST only." }, 405);
}
