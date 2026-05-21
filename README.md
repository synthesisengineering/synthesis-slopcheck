# slopcheck

Open source slop detection for journalists, editors, writers, and readers. A web frontend for the [synthesis engineering skill family](https://github.com/synthesisengineering/synthesis-skills) (v4.0 content-quality and v2.0 fact-checking).

**Slop detection, not just AI detection.** The tool catches AI patterns by model family AND catches slop in human-written content.

**Live:** https://tools.synthesiswriting.org/slopcheck (when deployed).

**Support the open-source work:** https://github.com/sponsors/rajivpant (voluntary, any amount, not a gate on anything).

## What it does

Paste an article, draft, or any prose. The tool fetches the open source synthesis skill files from GitHub, assembles them into a prompt with your content, sends it to the LLM provider of your choice using your own API key, and renders a structured analysis covering two axes:

1. **AI-provenance signals.** Which model-family patterns triggered (Claude, GPT, Gemini, Llama, Grok, DeepSeek, Mistral, Qwen). With short quoted examples. With ESL safe-harbor calibration. Family attribution where discernible.
2. **Slop-independence.** Whether the content carries substance and depth, regardless of how it was authored. Good AI-collaborated content passes; empty content fails regardless of provenance.

Plus fact-check items where the content has citations or quotes, top revision recommendations, and an overall verdict.

## Three ways to use it

1. **BYOK (recommended).** Bring your own API key. Free. No daily cap. Latest models. Faster (no shared queue). Your key never leaves your browser.
2. **Hosted tier (free, limited).** No key needed. 5 analyses per IP per day. Documents up to 50,000 characters. Cost-efficient models only (Haiku 4.5, GPT-5.4 Mini, Gemini 3 Flash Lite). When the daily community budget runs out, hosted tier rests until tomorrow.
3. **Install locally.** Completely free. No caps. Runs in your AI agent (Claude Code, Codex, Cursor, etc.).

## Privacy

Zero data collection. The web frontend is static HTML, JS, and CSS.

- **BYOK path:** Your API key is stored only in your browser (sessionStorage by default; localStorage if you opt in). Your content is sent only to the LLM provider you choose, using your own key. Nothing about your key or content touches the slopcheck server.
- **Hosted-tier path:** A Cloudflare Worker proxies the call using Rajiv's dedicated slopcheck keys (NOT Ragbot's). No request body or response is stored. Only a hashed-IP rate-limit counter lives in Cloudflare KV with daily TTL expiry. No user accounts, no auth, no email. See [workers/hosted-tier-spec.md](workers/hosted-tier-spec.md) for the full safety architecture.

The skill files are fetched from GitHub raw URLs. GitHub sees the fetch (page-level analytics for the repo) but does not see your content or key. The skill files are public anyway.

For maximum privacy, install the skills locally in your own AI agent (see the [main skills repo](https://github.com/synthesisengineering/synthesis-skills)) and skip this web frontend.

## Architecture

```
BYOK path (default):
  Browser (your machine)
  ├── index.html, style.css, app.js, providers.js  ← static, hosted at tools.synthesiswriting.org/slopcheck
  ├── BYOK API key  ← stays in browser
  ├── User's content  ← stays in browser, then sent only to chosen provider
  ├── Skill files  ← fetched from GitHub raw URLs (public, no PII)
  └── Direct API call  ← browser → provider (OpenAI, Anthropic, or Google) using user's key

Hosted-tier path (opt-in, free, limited):
  Browser → Cloudflare Worker → Provider
            ├── Turnstile (bot resistance)
            ├── Per-IP daily rate limit via KV (hashed IP, TTL)
            ├── Global daily community budget kill switch
            ├── Input size cap (50K chars)
            ├── Model allowlist (cost-efficient tier only)
            └── Dedicated slopcheck keys (isolated from Ragbot)

slopcheck Pages server (Cloudflare Pages)
└── Serves static files only. No backend logic. No keys. No content. No logs beyond CDN-level abuse prevention.

slopcheck Worker (Cloudflare Workers)
└── Hosted-tier proxy only. No content storage. Only hashed-IP counters with TTL expiry.
```

The BYOK browser path uses each provider's documented browser-direct API (Anthropic `anthropic-dangerous-direct-browser-access: true`, OpenAI direct fetch, Google generativelanguage.googleapis.com). All three primary providers support CORS for browser calls under the BYOK pattern.

## Providers supported

- **Anthropic (Claude):** Opus 4.7, Sonnet 4.6, Haiku 4.5. Get a key at https://console.anthropic.com/settings/keys.
- **OpenAI (ChatGPT):** GPT-5.5 Pro, GPT-5.5, GPT-5.4 Mini. Get a key at https://platform.openai.com/api-keys.
- **Google (Gemini):** Gemini 3.1 Pro, Gemini 3 Flash, Gemini 3.1 Flash Lite. Get a key at https://aistudio.google.com/apikey.

Hosted tier supports only the cost-efficient model of each provider (Haiku 4.5, GPT-5.4 Mini, Gemini 3 Flash Lite). For frontier models, BYOK.

## Files

```
synthesis-slopcheck/
├── index.html                       ← main UI
├── style.css                        ← styling
├── app.js                           ← main logic: tier selection, manifest fetch, analysis flow, result rendering
├── providers.js                     ← provider adapters + hosted-tier adapter
├── orchestrator.js                  ← single-pass vs multi-pass strategy selection
├── passes.js                        ← multi-pass pass definitions
├── cli/                             ← CLI tool (Python, stdlib only)
├── platforms/                       ← GPT Store + Claude Project configuration
├── workers/                         ← Cloudflare Worker for hosted tier
│   └── hosted-tier-spec.md          ← spec; Worker code lands when deployed
├── README.md                        ← this file
├── .gitignore                       ← excludes os and editor temp files
└── _headers                         ← Cloudflare Pages headers (CSP, cache, etc.)
```

External resources loaded by the page:

- `marked` (markdown renderer) from `cdn.jsdelivr.net`: small, well-maintained library. Loaded via CDN to keep the page lean. Privacy-conscious users who self-host can replace with a local copy.

## Local development

This is a static site. No build step. To preview locally:

```sh
cd synthesis-slopcheck
python3 -m http.server 8000
# Open http://localhost:8000 in a browser.
```

Or use any other static file server.

## Deployment

Recommended host: Cloudflare Pages.

1. Push this directory to a GitHub repo (e.g. `github.com/synthesisengineering/synthesis-slopcheck`).
2. In Cloudflare Pages, create a new project connected to that repo.
3. Build settings: no build command, output directory is the repo root.
4. Custom domain: `tools.synthesiswriting.org` with path-based routing to `/slopcheck` (or use a dedicated subdomain).
5. The `_headers` file applies a Content-Security-Policy that limits what the page can do.

Alternative hosts: Vercel, Netlify, GitHub Pages, any other static-file host. The app has no server-side dependencies.

## License

MIT. The skill files this app fetches are CC0-1.0.

## Support the open-source work

If slopcheck and the synthesis engineering skills are useful to you, you can support the open-source effort on [GitHub Sponsors](https://github.com/sponsors/rajivpant). Voluntary. Any amount you choose. Not a gate on anything — the tool is free for everyone, and the source is open for anyone to install locally.

## Versioning

Web app: v0.2.0 (2026-05-19).
Skill methodology: synthesis-content-quality v4.0, synthesis-fact-checking v2.0.

The skill methodology is fetched on demand from GitHub. The web app does not need to be updated when the skill methodology updates. The user always gets the current methodology when they refresh the page (or after the 24-hour skill cache expires).
