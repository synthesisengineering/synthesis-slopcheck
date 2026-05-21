# Apple Shortcuts — Slopcheck

Adds slopcheck to the iOS / iPadOS / macOS share sheet. Selected text → Share → "Slopcheck this" → the system opens the slopcheck web app with the selection pre-filled.

This file is a build-and-publish runbook for the shortcut itself. The shortcut is a tiny one (3 actions); Rajiv builds it in the Shortcuts app and publishes an iCloud share link.

## What the shortcut does

1. **Accepts input** from the share sheet: text, URL, or rich text.
2. **URL-encodes** the input as the `content` hash parameter.
3. **Opens** `https://tools.synthesiswriting.org/slopcheck#content=<encoded>` in the default browser.

The slopcheck web app reads the `#content=` hash on load and pre-fills the textarea (the same mechanism the bookmarklet and the Chrome extension use). Nothing about this path stores user content — the shortcut never sends data anywhere except by opening a URL the user chose to open.

## Build steps (one-time, in the Shortcuts app)

1. Open the **Shortcuts** app on macOS (or iOS).
2. Click **+** to create a new shortcut.
3. Name it: **Slopcheck this**.
4. Add the following actions in order:

   **Action 1: Receive input**
   - In the shortcut's **details** panel (right sidebar on macOS, the toggle icon on iOS):
     - **Share Sheet:** on
     - **Accept:** Text, Rich Text, URLs, Articles, Safari web pages
     - **What to do if there's no input:** Ask For
     - **Show in Share Sheet:** on

   **Action 2: URL Encode**
   - Search **URL Encode** in the action library. Add it.
   - Set its input to **Shortcut Input** (default).

   **Action 3: Combine URL parts**
   - Search **Text** action. Add it.
   - Content:  `https://tools.synthesiswriting.org/slopcheck#content=` followed by the **URL Encoded Text** variable from Action 2.

   **Action 4: Open URLs**
   - Search **Open URLs** in the action library. Add it.
   - Set its input to the **Text** from Action 3.

5. Test the shortcut: select some text in Safari, tap Share, pick **Slopcheck this**. Slopcheck should open in a new tab with the selection pre-filled.

## Optional refinement: max length truncation

To avoid sending very long page content (which would exceed the hosted-tier 200,000-character cap), insert a **Get Substring of Text** action between the input and URL Encode:

- Take Substring: First N Characters
- Number: 8000 (matches the bookmarklet's 8K char limit)

This keeps the share-sheet flow snappy even on long articles. Users with longer content can paste directly into the web app.

## Publish the share link

1. With the shortcut selected, **File → Share → iCloud** (macOS) or tap the share icon and pick **Copy iCloud Link** (iOS).
2. The link is `https://www.icloud.com/shortcuts/<hash>`.
3. Add the link to:
   - The slopcheck web app's "All the ways to use slopcheck" section, "Browser-side, no install" group.
   - The slopcheck repo README.
   - The synthesis-skills manifest, optional channels list.

## What this does NOT do

- It does not store or send any content. Apple Shortcuts runs entirely on-device until you tap "Open URL," and then the system opens a URL in your browser. No telemetry.
- It does not require iCloud login to USE — only to PUBLISH. End users tap the share link, the system asks "Add this shortcut?", they tap yes, and the shortcut lives locally on their device.

## Versioning

Bump the shortcut's version when changing the URL scheme or actions. Re-publish the iCloud link if the changes are user-visible. The link in this README updates accordingly.

| Version | Date | Notes |
|---------|------|-------|
| 0.1.0 | TBD when published | Initial share-sheet integration |
