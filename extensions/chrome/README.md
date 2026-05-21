# Chrome / Edge Extension — Slopcheck

A Manifest V3 extension that adds a right-click menu and a toolbar popup to send text or page content into the slopcheck web app at `tools.synthesiswriting.org/slopcheck`.

## What it does

- **Right-click any text selection** → "Slopcheck this selection." Opens slopcheck in a new tab with the selection pre-filled.
- **Right-click any page** → "Slopcheck this page." Opens slopcheck with the page's visible text (up to 8,000 characters) pre-filled.
- **Toolbar popup** → three buttons: this page, my selection, paste text. Same flow.

## What it does NOT do

- It does not send any content to any server other than the slopcheck web app the user opens (and from there, only to the LLM provider the user chooses).
- It does not store anything. No history, no preferences, no analytics.
- It does not request more host permissions than `tools.synthesiswriting.org/*`.

## Local install (developer mode) for testing

1. Open `chrome://extensions` (or `edge://extensions`) in your browser.
2. Toggle on **Developer mode** (top right).
3. Click **Load unpacked** and pick this directory (`synthesis-slopcheck/extensions/chrome`).
4. The Slopcheck icon should appear in the toolbar.

## Publishing to the Chrome Web Store

1. Replace the placeholder icons in `icons/` with real ones (16×16, 48×48, 128×128 PNG).
2. Zip the contents of this directory (NOT the directory itself).
3. Sign in at https://chrome.google.com/webstore/devconsole/ (Rajiv's developer account; one-time $5 developer fee).
4. Create a new item. Upload the zip.
5. Listing copy (recommended):
   - **Name:** Slopcheck
   - **Short description:** Open source slop detection. Right-click any selection to analyze with the synthesis engineering skill family.
   - **Detailed description:** see the project README at https://github.com/synthesisengineering/synthesis-slopcheck.
   - **Category:** Productivity (or Writing if available).
   - **Visibility:** Public.
6. Submit for review. Initial review usually takes 1-3 business days.

## Publishing to Microsoft Edge Add-ons

Same source bundle. Submit at https://partner.microsoft.com/dashboard/microsoftedge/. Rajiv's Microsoft Partner account; no fee for individual developers.

## Versioning

The `version` field in `manifest.json` follows the project's main version. Bump on every Web Store publish.

## Why a same-origin popup instead of a side panel

Manifest V3 supports side panels. The right-click + popup approach was chosen because it works identically across Chrome and Edge, requires no additional permissions, and reuses the existing web app's full UI rather than duplicating tier-selection, model-selection, and progress UI inside the extension. A side panel can be added later as a follow-up if user demand justifies the additional surface.
