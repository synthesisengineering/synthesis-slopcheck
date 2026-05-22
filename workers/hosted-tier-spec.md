# Hosted-Tier Architecture — Spec and Notes

**Status:** Live in production at `tools.synthesiswriting.org/slopcheck/api/hosted/analyze`.
**Implementation:** [`/functions/api/hosted/analyze.js`](../functions/api/hosted/analyze.js) — a Cloudflare Pages Function (the original spec called for a standalone Worker; the deployed implementation chose a Pages Function for simpler co-location with the static frontend).
**Last revised:** 2026-05-21

## Purpose

Provide a zero-friction "try it now" hosted tier for users without an API key, using dedicated slopcheck API keys (isolated from other products) behind seven layers of cost protection. This Function is the ONLY hosted-tier entry point; BYOK bypasses it entirely.

## Architecture summary

```
BYOK path (default):
  Browser  ─── direct ──→  LLM provider
  (user's key, no Cloudflare involvement, no rate limits, no input cap)

Hosted-tier path (opt-in):
  Browser  ──→  Pages Function  ──→  LLM provider
                      ↓
                      Turnstile check (bot resistance)
                      Internal-proxy-key bypass for trusted Workers (email-in)
                      KV per-IP rate limit (hashed IP, TTL)
                      Global daily budget kill switch
                      User-content size cap (200K chars)
                      Model allowlist enforcement
                      (Function uses dedicated slopcheck keys)
```

## Configuration (Worker secrets, set via `wrangler secret put`)

| Secret | Source | Purpose |
|--------|--------|---------|
| `SLOPCHECK_ANTHROPIC_KEY` | Dedicated key created at console.anthropic.com (NOT Ragbot's) | Anthropic provider calls |
| `SLOPCHECK_OPENAI_KEY` | Dedicated key created at platform.openai.com (NOT Ragbot's) | OpenAI provider calls |
| `SLOPCHECK_GOOGLE_KEY` | Dedicated key created at aistudio.google.com (NOT Ragbot's) | Google provider calls |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile dashboard | Bot-resistance verification |
| `IP_HASH_SALT` | Random 32-byte secret (one-time generation) | HMAC salt for IP hashing |

## Configuration (Worker env vars, set in `wrangler.toml`)

| Var | Default | Purpose |
|-----|---------|---------|
| `PER_IP_DAILY_LIMIT` | `5` | Analyses per IP per UTC day |
| `GLOBAL_DAILY_BUDGET_USD` | `25` | Kill switch triggers when daily spend approaches this |
| `MAX_USER_CONTENT_CHARS` | `200000` | Cap on the user's pasted/uploaded content length (not the assembled methodology prompt) |
| `ALLOWED_MODELS` | (see below) | Comma-separated allowlist |

**Default model allowlist** (cost-efficient tier only):

- `claude-haiku-4-5`
- `gpt-5-4-mini`
- `gemini-3-flash-lite`

Frontier models (Opus 4.7, GPT-5.5 Pro, Gemini 3.1 Pro) are deliberately NOT on the hosted tier. They are BYOK-only — a real upgrade incentive.

## Cloudflare KV namespaces

| Namespace | Key format | Value | TTL |
|-----------|-----------|-------|-----|
| `slopcheck_hosted_tier` | `rl:<hashed_ip>:<utc_date>` | Integer count (analyses today) | 90,000 sec (~25h) |
| `slopcheck_hosted_tier` | `budget:<utc_date>` | Integer cents spent today | 90,000 sec |
| `slopcheck_hosted_tier` | `killswitch:<utc_date>` | `"1"` if daily budget exceeded | 90,000 sec |

**IP hashing:** `HMAC-SHA256(IP_HASH_SALT, client_ip)` → hex digest. Salt rotation policy: rotate annually or on any suspected leak. Rotation resets all existing rate-limit counters (acceptable since they expire daily anyway).

## Request flow

```
POST /api/hosted/analyze
Headers:
  Content-Type: application/json
  X-Turnstile-Token: <token from frontend>
Body:
  {
    "provider": "anthropic" | "openai" | "google",
    "model": "<must be in ALLOWED_MODELS>",
    "userContent": "<user content, max MAX_USER_CONTENT_CHARS>",
    "mode": "artifact" | "full-response",
    "pass": "single" | "a1" | "a2" | "a3-b2" | "c1" | "synthesis",
    "pass_inputs": { ... }  // for multi-pass synthesis pass
  }
```

**Worker logic:**

1. **Verify Turnstile token.** Reject if invalid.
2. **Read client IP.** Hash it with `IP_HASH_SALT`.
3. **Check global kill switch.** If `killswitch:<today>` is set, return `429 Daily community budget reached`.
4. **Check per-IP rate limit.** Read `rl:<hashed_ip>:<today>`. If ≥ `PER_IP_DAILY_LIMIT`, return `429 Daily personal limit reached. BYOK for unlimited use.`
5. **Validate input size.** If `userContent.length > MAX_USER_CONTENT_CHARS`, return `413 Document too long for hosted tier. BYOK or install locally.`
6. **Validate model.** If model not in allowlist, return `400 Model not available on hosted tier. BYOK for frontier models.`
7. **Proxy to provider.** Use the appropriate dedicated key. Same request shape the frontend would send directly in BYOK mode.
8. **Increment counters.**
   - `rl:<hashed_ip>:<today>` += 1
   - `budget:<today>` += estimated cents for this call (based on token count and model pricing table)
9. **Check budget threshold.** If `budget:<today>` ≥ `GLOBAL_DAILY_BUDGET_USD * 100 * 0.95`, set `killswitch:<today>` = "1". (95% threshold leaves a small buffer before provider-level caps kick in.)
10. **Return provider response unchanged.** Frontend treats hosted-tier response identically to BYOK response.

## Privacy discipline

- **No request body storage.** The Worker streams content to the provider and the response back to the client. No `console.log(content)`, no KV write of body or response.
- **No response storage.** Same.
- **No user accounts.** No auth header beyond Turnstile.
- **No raw IP storage.** Only HMAC-hashed IPs in KV with TTL expiry.
- **No analytics.** Cloudflare's built-in metrics (request count, error rate) are kept; nothing else.
- **TTL keys self-expire.** No batch deletion logic required.

## Open-source the Worker source

The Worker source (`hosted-tier.js`) lives in the public `synthesis-slopcheck` repo. The privacy claims are verifiable by reading the source.

Secrets and the wrangler.toml `env.production` block are NOT in the repo; they live in Cloudflare and in Rajiv's `.dev.vars` (gitignored) for local testing.

## Provider-level hard caps (Layer 1 — final backstop)

Set on each provider's dashboard, BEFORE the Worker is deployed. Confirm these are in place:

- **Anthropic console:** Monthly spend cap on the dedicated slopcheck key. Default: $200/mo.
- **OpenAI platform:** Monthly hard limit on the dedicated slopcheck key. Default: $200/mo.
- **Google AI Studio:** Usage quota on the dedicated slopcheck key. Default: $200/mo equivalent.

If the Worker's daily kill switch ever fails for any reason, the provider-level cap is the absolute ceiling. Total worst-case bill is bounded.

## Turnstile setup

- Create a Turnstile site key + secret key at https://dash.cloudflare.com (Turnstile section).
- Site key embedded in the frontend (public).
- Secret key set as Worker secret.
- Mode: Managed (Turnstile decides invisible vs interactive challenge based on signal).

## Estimated cost ceiling

Worst case: 100 analyses/day × $0.45/analysis (max cost for largest doc on Haiku 4.5 with full methodology) ≈ $45/day. Daily kill switch at $25/day prevents this. Provider-level monthly caps prevent any cumulative escape.

Realistic case: 30 analyses/day average × $0.10/analysis avg ≈ $3/day, ~$90/month.

## Deployment plan

1. **Create dedicated keys.** Three keys, one per provider. Apply provider-level monthly cap immediately.
2. **Cloudflare account setup.** Confirm Workers + KV + Turnstile are enabled.
3. **Create KV namespace** (`slopcheck_hosted_tier`).
4. **Generate `IP_HASH_SALT`** (one-time, save to password manager + Worker secret).
5. **Set Worker secrets** via `wrangler secret put`.
6. **Configure `wrangler.toml`** with env-var defaults.
7. **Deploy Worker** to a route like `slopcheck-hosted.<rajiv's worker subdomain>` or `tools.synthesiswriting.org/slopcheck/api/hosted/*`.
8. **Wire up the frontend** with the tier selector and hosted-tier path.
9. **Smoke test** with several IPs at the rate limit, large input, disallowed model, etc.

## Open questions (resolve before implementing)

1. **Worker route:** subdomain or path-prefix? Path-prefix on the main domain is cleaner for CORS.
2. **Whether to surface "estimated cost" in the response.** Would help BYOK appeal but adds a couple of cents in metering. Default: yes, surface in BYOK mode too.
3. **Whether Turnstile is needed on BYOK.** Default: no — BYOK is intrinsically rate-limited by the user's own provider account.
