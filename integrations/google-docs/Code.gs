/**
 * Slopcheck Google Docs add-on.
 *
 * Adds a menu item "Slopcheck → Analyze this document" that opens a sidebar.
 * The sidebar shows the current document's content and, on click, sends it
 * to the slopcheck hosted-tier API (or BYOK if the user pastes a key in the
 * sidebar). Returns the structured analysis inline.
 *
 * This is an Apps Script project. To deploy:
 *   1. Open Google Apps Script (https://script.google.com).
 *   2. Create a new project.
 *   3. Paste this file as `Code.gs`.
 *   4. Add the `sidebar.html` file in the same project.
 *   5. Deploy → New deployment → Test → Pick "Editor Add-on" or "Web app."
 *   6. For organization-wide use, submit to the Google Workspace Marketplace.
 *
 * Privacy: this add-on does not store any document content. The sidebar's
 * "Use BYOK key" option keeps the key in the sidebar's session only.
 */

const SLOPCHECK_HOSTED_URL = "https://tools.synthesiswriting.org/slopcheck/api/hosted/analyze";

function onOpen(e) {
  DocumentApp.getUi()
    .createAddonMenu()
    .addItem("Open Slopcheck sidebar", "showSidebar")
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile("sidebar")
    .setTitle("Slopcheck")
    .setWidth(360);
  DocumentApp.getUi().showSidebar(html);
}

/**
 * Returns the full text of the current document, or the current selection if
 * the user has selected text.
 */
function getDocumentText() {
  const doc = DocumentApp.getActiveDocument();
  const selection = doc.getSelection();

  if (selection) {
    const elements = selection.getRangeElements();
    const parts = [];
    elements.forEach((re) => {
      const el = re.getElement();
      if (el.editAsText) {
        const text = el.editAsText().getText();
        if (re.isPartial()) {
          parts.push(text.substring(re.getStartOffset(), re.getEndOffsetInclusive() + 1));
        } else {
          parts.push(text);
        }
      }
    });
    return parts.join("\n").trim();
  }

  return doc.getBody().getText().trim();
}

/**
 * Sends the text to the hosted-tier API (or BYOK provider) and returns the
 * analysis. Called from sidebar.html.
 */
function analyzeText(text, options) {
  options = options || {};
  if (!text || text.length === 0) {
    throw new Error("No content to analyze. Place the cursor in the document or select text first.");
  }
  if (text.length > 50000) {
    throw new Error(
      "This document is " + text.length.toLocaleString() + " characters, over the 50,000-character hosted-tier cap. " +
      "Bring your own API key (BYOK) for longer documents, or select a smaller portion."
    );
  }

  const systemPrompt = (
    "You are Slopcheck, an editorial analyst applying the synthesis engineering slop-detection methodology. " +
    "Apply the two-axis discipline: AI-provenance signals (Axis 1) and slop-independence (Axis 2). Report both separately. " +
    "Honor ESL safe-harbor. Use zero em-dashes in your output. " +
    "Use plain-text Markdown suitable for a sidebar (no tables, short headings)."
  );
  const userPrompt = (
    "Analyze this content. Return: (1) AI-provenance verdict; (2) slop-independence verdict; " +
    "(3) top 3 revision recommendations; (4) one-paragraph overall verdict.\n\n---\n\n" + text
  );

  if (options.useByok && options.byokKey && options.byokProvider) {
    return callByok(options.byokProvider, options.byokKey, options.byokModel, systemPrompt, userPrompt);
  }
  return callHosted(systemPrompt, userPrompt);
}

function callHosted(systemPrompt, userPrompt) {
  const payload = {
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    systemPrompt: systemPrompt,
    userPrompt: userPrompt,
    maxTokens: 6000,
  };
  const response = UrlFetchApp.fetch(SLOPCHECK_HOSTED_URL, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  const code = response.getResponseCode();
  const body = response.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error("Hosted-tier " + code + ": " + body.slice(0, 250));
  }
  const data = JSON.parse(body);
  return data.text || "(empty response)";
}

function callByok(provider, apiKey, model, systemPrompt, userPrompt) {
  if (provider === "anthropic") {
    const payload = {
      model: model || "claude-sonnet-4-6",
      max_tokens: 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    };
    const response = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      muteHttpExceptions: true,
    });
    const data = JSON.parse(response.getContentText());
    if (data.content && data.content.length > 0 && data.content[0].text) {
      return data.content[0].text;
    }
    throw new Error("Anthropic returned an empty response.");
  }
  if (provider === "openai") {
    const payload = {
      model: model || "gpt-5.5",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: 8000,
    };
    const response = UrlFetchApp.fetch("https://api.openai.com/v1/chat/completions", {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      headers: { Authorization: "Bearer " + apiKey },
      muteHttpExceptions: true,
    });
    const data = JSON.parse(response.getContentText());
    if (data.choices && data.choices.length > 0 && data.choices[0].message) {
      return data.choices[0].message.content;
    }
    throw new Error("OpenAI returned an empty response.");
  }
  if (provider === "google") {
    const url =
      "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model || "gemini-3.1-pro-preview") +
      ":generateContent?key=" +
      encodeURIComponent(apiKey);
    const payload = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 8000, temperature: 0.3 },
    };
    const response = UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    const data = JSON.parse(response.getContentText());
    if (
      data.candidates &&
      data.candidates.length > 0 &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts[0].text
    ) {
      return data.candidates[0].content.parts[0].text;
    }
    throw new Error("Google returned an empty response.");
  }
  throw new Error("Unknown provider: " + provider);
}
