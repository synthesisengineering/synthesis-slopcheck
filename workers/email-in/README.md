# Slopcheck Email-In Worker

Cloudflare Email Worker that turns email into a slopcheck submission. A user forwards or composes a message to `check@<your-domain>`, the Worker analyzes the body via the hosted-tier Function, and replies to the sender with the structured analysis.

## What you need first

- A Cloudflare account with the `tools.synthesiswriting.org` domain (or whatever domain you intend to use).
- Cloudflare Email Routing enabled on that domain. https://dash.cloudflare.com → Email → Email Routing → Enable.
- The hosted-tier Pages Function already deployed (see `../../functions/README.md`). The email Worker calls it.
- A KV namespace — share the one already created for the hosted tier (`slopcheck_hosted_tier`), or create a separate one.

## One-time setup

1. **Install dependencies and link KV.** From this directory:

   ```sh
   cd workers/email-in
   npm install
   ```

   In `wrangler.toml`, paste the KV namespace id (same one used by the hosted-tier Function).

2. **Generate the sender-hash salt** and set it + the internal-proxy key as secrets:

   ```sh
   wrangler secret put SENDER_HASH_SALT
   # Paste a 32-byte hex string (one-time generation, save to your password manager).

   wrangler secret put INTERNAL_PROXY_KEY
   # Paste a shared secret. Also set the same value on the hosted-tier Pages
   # Function so the Function will accept the Worker's bypass of Turnstile.
   ```

3. **Configure the hosted-tier Function to honor `X-Internal-Proxy-Key`.** Edit
   `functions/api/hosted/analyze.js`
   to skip Turnstile when this header matches the secret. (Currently the
   Function checks Turnstile if `TURNSTILE_SECRET_KEY` is set; add a parallel
   check that accepts the internal proxy key as an alternative.) This is a
   small follow-up edit; for the initial deploy, set `TURNSTILE_SECRET_KEY`
   to empty (which already disables Turnstile) until the proxy-key plumbing
   is added.

4. **Deploy the Worker:**

   ```sh
   wrangler deploy
   ```

5. **Add the email route in the Cloudflare dashboard.**
   - Email Routing → Routes → Create address: `check@<your-domain>`.
   - Action: Send to a Worker → pick `slopcheck-email-in`.
   - Save.

6. **Smoke test.** From any email client, send a short paragraph to `check@<your-domain>`. You should receive a slopcheck analysis reply within a minute.

## What the Worker stores

- Nothing about the email body or response.
- Only a hashed-sender daily counter (`email_rl:<hashed_sender>:<UTC date>`) in KV with a 90,000-sec TTL.
- Cloudflare Email Routing keeps standard mail-flow metadata (sender, recipient, timestamp). That is outside this Worker's control; document it in the privacy section.

## Limits applied

- 10 messages per sender per UTC day (configurable via `PER_SENDER_DAILY_LIMIT` in the source).
- Body capped at 50,000 characters (same as the hosted-tier web cap).
- Always uses Claude Haiku 4.5 on this channel (lowest-cost model).
- Inherits the global daily community-budget kill switch from the hosted-tier Function.

## What's intentionally NOT supported

- Attachments (no parsing of PDFs, Word docs, etc.). Users paste content in the body.
- Reply-all / cc handling. The Worker replies only to the original sender.
- Subject-line directives (e.g. `subject: --model gpt-5.4-mini`). Email channel uses a single fixed model for simplicity.
- HTML-rich replies. Plain-text only to maximize compatibility.

These are explicit scope decisions, not bugs. Future enhancements only if user demand justifies.
