// slopcheck: provider adapters and model catalog.
//
// MODEL LIST SOURCE OF TRUTH: synthesisengineering/ragbot — engines.yaml
// This is the canonical model list for the synthesis-engineering ecosystem
// (Ragbot, Ragenie, synthesis-console, slopcheck, all share it).
//
// When engines.yaml updates, mirror the changes here. Never downgrade model
// versions. Never rely on training data for current model identifiers. Per
// ragbot/CLAUDE.md, models should ONLY move forward.
//
// Future enhancement: fetch engines.yaml at runtime from a stable URL when
// the synthesis-engine package publishes one. Until then, this file is the
// vendored copy for the static-site BYOK web app.

const PROVIDERS = {
  anthropic: {
    name: "Anthropic (Claude)",
    models: [
      // Claude Opus 4.7: most intelligent model, hardest agentic tasks.
      // Released April 16, 2026. 1M input context, 128K output, adaptive thinking + task budgets.
      {
        id: "claude-opus-4-7",
        label: "Claude Opus 4.7 (best quality, 1M context, adaptive thinking)",
        contextLimit: 1000000,
        hostedTier: false, // BYOK only — too expensive for the community budget
      },
      // Claude Sonnet 4.6: balanced intelligence and speed.
      // Released February 17, 2026. 1M context, adaptive thinking.
      {
        id: "claude-sonnet-4-6",
        label: "Claude Sonnet 4.6 (balanced, 1M context, adaptive thinking)",
        contextLimit: 1000000,
        hostedTier: false, // BYOK only
      },
      // Claude Haiku 4.5: fast, cost-effective tier.
      // Released October 1, 2025. 200K context.
      {
        id: "claude-haiku-4-5-20251001",
        label: "Claude Haiku 4.5 (fastest, lowest cost, 200K context)",
        contextLimit: 200000,
        hostedTier: true, // Hosted tier allowlist
      },
    ],
    keyHint: "Starts with sk-ant-...",
    keysUrl: "https://console.anthropic.com/settings/keys",
    async analyze({ apiKey, model, systemPrompt, userPrompt, maxTokens }) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens || 8000,
          system: systemPrompt,
          messages: [{ role: "user", content: userPrompt }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Anthropic API error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error && errorJson.error.message) {
            errorMessage = `Anthropic: ${errorJson.error.message}`;
          }
        } catch (e) {
          errorMessage += `: ${errorText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.content && data.content.length > 0 && data.content[0].text) {
        return data.content[0].text;
      }
      throw new Error("Anthropic returned an empty response.");
    },
  },

  openai: {
    name: "OpenAI (ChatGPT)",
    models: [
      // GPT-5.5 Pro: heaviest reasoning workloads.
      // Released April 23, 2026. 1M context. Pricing: $30/$180 per MTok.
      {
        id: "gpt-5.5-pro",
        label: "GPT-5.5 Pro (best quality, 1M context, reasoning)",
        contextLimit: 1000000,
        hostedTier: false, // BYOK only — too expensive
      },
      // GPT-5.5: current frontier general-purpose model.
      // Released April 23, 2026. 1M context. Pricing: $5/$30 per MTok.
      {
        id: "gpt-5.5",
        label: "GPT-5.5 (balanced, 1M context, reasoning)",
        contextLimit: 1000000,
        hostedTier: false, // BYOK only
      },
      // GPT-5.4 mini: high-volume, cost-effective tier.
      // Released March 17, 2026. 400K context. Pricing: $0.75/$4.50 per MTok.
      {
        id: "gpt-5.4-mini",
        label: "GPT-5.4 Mini (cost-effective, 400K context)",
        contextLimit: 400000,
        hostedTier: true, // Hosted tier allowlist
      },
    ],
    keyHint: "Starts with sk-...",
    keysUrl: "https://platform.openai.com/api-keys",
    async analyze({ apiKey, model, systemPrompt, userPrompt, maxTokens }) {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_completion_tokens: maxTokens || 8000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `OpenAI API error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error && errorJson.error.message) {
            errorMessage = `OpenAI: ${errorJson.error.message}`;
          }
        } catch (e) {
          errorMessage += `: ${errorText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.choices && data.choices.length > 0 && data.choices[0].message) {
        return data.choices[0].message.content;
      }
      throw new Error("OpenAI returned an empty response.");
    },
  },

  google: {
    name: "Google (Gemini)",
    models: [
      // Gemini 3.1 Pro Preview: flagship, complex reasoning.
      // Released February 19, 2026. 1M context, multimodal, thinking modes.
      {
        id: "gemini-3.1-pro-preview",
        label: "Gemini 3.1 Pro (best quality, 1M context, thinking)",
        contextLimit: 1048576,
        hostedTier: false, // BYOK only
      },
      // Gemini 3 Flash Preview: balanced speed and capability.
      // 1M context, thinking modes.
      {
        id: "gemini-3-flash-preview",
        label: "Gemini 3 Flash (balanced, 1M context, thinking)",
        contextLimit: 1048576,
        hostedTier: false, // BYOK only (Flash Lite is cheap enough for hosted)
      },
      // Gemini 3.1 Flash Lite Preview: most cost-effective, high-volume tier.
      // 1M context, thinking modes.
      {
        id: "gemini-3.1-flash-lite-preview",
        label: "Gemini 3.1 Flash Lite (cost-effective, 1M context)",
        contextLimit: 1048576,
        hostedTier: true, // Hosted tier allowlist
      },
    ],
    keyHint: "Get from Google AI Studio",
    keysUrl: "https://aistudio.google.com/apikey",
    async analyze({ apiKey, model, systemPrompt, userPrompt, maxTokens }) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: { maxOutputTokens: maxTokens || 8000, temperature: 0.3 },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = `Google API error (${response.status})`;
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.error && errorJson.error.message) {
            errorMessage = `Google: ${errorJson.error.message}`;
          }
        } catch (e) {
          errorMessage += `: ${errorText}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
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
    },
  },
};

window.SLOPCHECK_PROVIDERS = PROVIDERS;

// ---------- Hosted-tier adapter ----------
//
// The hosted tier proxies requests through a Cloudflare Worker that holds
// Rajiv's dedicated slopcheck API keys (NOT Ragbot's keys) and applies seven
// safety layers (provider caps, per-IP rate limit, global daily kill switch,
// input size cap, model allowlist, Turnstile, hashed-IP KV).
//
// Spec: workers/hosted-tier-spec.md.
//
// Hosted tier is served by a Cloudflare Pages Function at /api/hosted, same
// origin as the static site. Set to null to force the UI to surface "hosted
// tier coming soon" (e.g. for local development before the Function is wired).

const HOSTED_WORKER_BASE_URL = "/slopcheck/api/hosted";

const HOSTED_TIER_LIMITS = {
  maxInputChars: 50000,
  perIpDailyLimit: 5,
};

async function hostedTierAnalyze({
  providerId,
  model,
  systemPrompt,
  userPrompt,
  maxTokens,
  turnstileToken,
}) {
  if (!HOSTED_WORKER_BASE_URL) {
    throw new Error(
      "Hosted tier is not yet deployed. Please switch to BYOK or install the skills locally."
    );
  }

  const response = await fetch(`${HOSTED_WORKER_BASE_URL}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Turnstile-Token": turnstileToken || "",
    },
    body: JSON.stringify({
      provider: providerId,
      model,
      systemPrompt,
      userPrompt,
      maxTokens: maxTokens || 8000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Hosted tier error (${response.status})`;
    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.error) {
        errorMessage = `Hosted tier: ${errorJson.error}`;
      }
    } catch (e) {
      errorMessage += `: ${errorText}`;
    }
    throw new Error(errorMessage);
  }

  const data = await response.json();
  if (!data.text) {
    throw new Error("Hosted tier returned an empty response.");
  }
  return data.text;
}

window.SLOPCHECK_HOSTED_TIER = {
  baseUrl: HOSTED_WORKER_BASE_URL,
  limits: HOSTED_TIER_LIMITS,
  analyze: hostedTierAnalyze,
};
