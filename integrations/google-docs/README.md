# Slopcheck Google Docs Add-on

Apps Script project that adds a "Slopcheck" sidebar to Google Docs. The sidebar offers a one-click "Analyze this document" button using the hosted tier, with an optional BYOK panel for direct provider access (Anthropic / OpenAI / Google).

## Files

- [`Code.gs`](Code.gs) — server-side Apps Script (menu, sidebar opener, document-text extractor, hosted-tier + BYOK callers)
- [`sidebar.html`](sidebar.html) — sidebar UI (BYOK form, analyze button, result pane)
- [`appsscript.json`](appsscript.json) — manifest: scopes, add-on metadata, homepage trigger

## Deploy as a personal add-on (testing)

1. Go to https://script.google.com and click **New project**.
2. Project name: `Slopcheck`.
3. In the file tree, create `Code.gs`, `sidebar.html`, and `appsscript.json` (use the gear icon to enable "Show appsscript.json"). Paste the contents of each file from this directory.
4. **Deploy → Test deployments → Editor Add-on**. Pick a target document.
5. Open the target document. Under **Extensions → Slopcheck (test) → Open Slopcheck sidebar**, click. The sidebar appears.

## Deploy to the Google Workspace Marketplace (public)

This is a multi-step Google review process. Plan for 1-3 weeks of review time.

1. Complete the personal-add-on test deployment above.
2. **Deploy → New deployment**, type `Editor Add-on`. Fill in the version description.
3. In the Apps Script project, go to **Project Settings → Show "appsscript.json" manifest file** and confirm the scopes match what's needed.
4. Create a Cloud project in https://console.cloud.google.com (required for Marketplace). Link the Apps Script project to it.
5. In the Cloud project, enable the **Google Workspace Marketplace SDK**.
6. Fill out the SDK Configuration: name, description, logo, support URL, terms of service URL, privacy policy URL. The privacy policy should point to the slopcheck repo's privacy section.
7. Submit for OAuth verification (the `script.external_request` scope is sensitive; this is the longest review step).
8. Once OAuth-verified, publish to the Marketplace.

## What the add-on stores

Nothing. The sidebar's BYOK fields are session-scoped (cleared when the sidebar closes). The Apps Script project uses Google Cloud's `UrlFetchApp` to call the slopcheck hosted-tier or the user's chosen provider directly. No data is persisted in any Apps Script property store.

## Permissions

- `documents.currentonly` — read the current document's text (no access to other documents).
- `script.container.ui` — show the sidebar.
- `script.external_request` — make HTTPS calls to the slopcheck hosted-tier endpoint and to provider APIs (BYOK mode).

## Limits

- 200,000-character document cap (same as the hosted-tier web cap). The sidebar errors clearly if the document exceeds this.
- Hosted-tier rate limits apply per IP. BYOK mode has no slopcheck-side limits (just the user's provider quota).

## License

MIT. Open source: https://github.com/synthesisengineering/synthesis-slopcheck.
