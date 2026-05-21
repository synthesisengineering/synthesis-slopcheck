# Pages Functions — slopcheck hosted tier

This directory contains the Cloudflare Pages Functions that implement the honor-system hosted tier. Architecture and policy live in [../workers/hosted-tier-spec.md](../workers/hosted-tier-spec.md). This README is the deployment runbook.

## Filesystem routing

Pages Functions auto-route by filesystem path. The current routes:

| Path | Function | Purpose |
|------|----------|---------|
| `POST /api/hosted/analyze` | [`api/hosted/analyze.js`](api/hosted/analyze.js) | Hosted-tier proxy with seven safety layers |

Shared utilities live under [`api/hosted/_lib/`](api/hosted/_lib/) and are not exposed as routes (Pages ignores `_lib`).

## Bindings and secrets

### KV namespace

Create the namespace once:

```sh
wrangler kv:namespace create slopcheck_hosted_tier --preview false
```

Paste the returned id into [`../wrangler.toml`](../wrangler.toml) under the `[[kv_namespaces]]` block.

### Secrets

Set each secret via:

```sh
wrangler pages secret put SLOPCHECK_ANTHROPIC_KEY --project-name slopcheck
wrangler pages secret put SLOPCHECK_OPENAI_KEY --project-name slopcheck
wrangler pages secret put SLOPCHECK_GOOGLE_KEY --project-name slopcheck
wrangler pages secret put TURNSTILE_SECRET_KEY --project-name slopcheck
wrangler pages secret put IP_HASH_SALT --project-name slopcheck
```

The three API keys are **dedicated slopcheck keys**, isolated from Ragbot's keys. Create each at the provider console BEFORE this step:

- Anthropic: https://console.anthropic.com/settings/keys
- OpenAI: https://platform.openai.com/api-keys
- Google: https://aistudio.google.com/apikey

Apply the monthly spend cap on each provider dashboard before deploying the Function. Recommended default: $200/mo per provider.

The Turnstile secret comes from https://dash.cloudflare.com → Turnstile → new site. Mode: Managed. Save the **site key** (public, embedded in the frontend) and the **secret key** (private, set via the command above).

Generate `IP_HASH_SALT` once with a CSPRNG and save it to your password manager:

```sh
node -e "console.log(crypto.randomBytes(32).toString('hex'))" | wrangler pages secret put IP_HASH_SALT --project-name slopcheck
```

## Env vars (non-secret)

Set in [`../wrangler.toml`](../wrangler.toml) and adjustable per environment:

| Var | Default | Purpose |
|-----|---------|---------|
| `PER_IP_DAILY_LIMIT` | `5` | Analyses per IP per UTC day |
| `GLOBAL_DAILY_BUDGET_USD` | `25` | Daily ceiling; kill switch flips at 95% |
| `MAX_INPUT_CHARS` | `50000` | Per-request size cap (BYOK has none) |
| `ALLOWED_MODELS` | (see toml) | Comma-separated model id allowlist |

## Local dev

```sh
wrangler pages dev .
# Static site + Functions both served at http://localhost:8788
```

Local development requires a `.dev.vars` file (gitignored) for the secrets above. Use placeholder API keys with $0 cap on each provider for local testing.

## Production deploy

The Pages project deploys on every push to `main` of the GitHub repo. Functions deploy as part of that pipeline. No separate Worker deployment is needed.

The frontend's `HOSTED_WORKER_BASE_URL` in [`../providers.js`](../providers.js) should point at the same-origin path:

```js
const HOSTED_WORKER_BASE_URL = "/api/hosted";
```

(Currently `null` until the Function is live; switch when ready.)

## Verifying the safety layers in production

After first deploy, smoke-test each layer:

1. **L7 — Turnstile.** Send a request without `X-Turnstile-Token`. Expect 403.
2. **L6 — Model allowlist.** Send a request with `model: "claude-opus-4-7"`. Expect 400 with `allowed` list in the response.
3. **L5 — Input size.** Send a request with 100,000-char `userPrompt`. Expect 413.
4. **L3 — Per-IP limit.** From one IP, send 6 valid requests. The 6th should return 429.
5. **L4 — Kill switch.** Set `GLOBAL_DAILY_BUDGET_USD` to a tiny value like `0.05`, send a few requests, confirm the kill switch flips. Reset to the real value.
6. **L1 — Provider caps.** Verify the monthly caps are set on each provider dashboard before any real traffic.

Keep a local record of the test runs.
