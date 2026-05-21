// Provider routing for the hosted tier.
//
// The browser sends the same request shape as it would for BYOK. The Pages
// Function picks the right dedicated key from the environment, picks the
// right provider endpoint, and proxies the call. Response is returned as
// `{ text }` so the browser-side adapter sees a uniform shape regardless of
// which provider answered.

export const ALLOWED_MODELS_DEFAULT = [
  "claude-haiku-4-5-20251001",
  "gpt-5.4-mini",
  "gemini-3.1-flash-lite-preview",
];

// Estimated cost per analysis in cents. Updated when provider pricing changes.
// These are deliberately conservative (over-estimate slightly) so the daily
// budget counter cuts off before the provider-level monthly cap is hit.
export const ESTIMATED_COST_CENTS = {
  "claude-haiku-4-5-20251001": 10,
  "gpt-5.4-mini": 8,
  "gemini-3.1-flash-lite-preview": 5,
};

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function callAnthropic({ apiKey, model, systemPrompt, userPrompt, maxTokens }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens || 8000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic ${response.status}: ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  if (data.content && data.content.length > 0 && data.content[0].text) {
    return data.content[0].text;
  }
  throw new Error("Anthropic returned an empty response.");
}

export async function callOpenAI({ apiKey, model, systemPrompt, userPrompt, maxTokens }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_completion_tokens: maxTokens || 8000,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI ${response.status}: ${text.slice(0, 200)}`);
  }
  const data = await response.json();
  if (data.choices && data.choices.length > 0 && data.choices[0].message) {
    return data.choices[0].message.content;
  }
  throw new Error("OpenAI returned an empty response.");
}

export async function callGoogle({ apiKey, model, systemPrompt, userPrompt, maxTokens }) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;
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
    const text = await response.text();
    throw new Error(`Google ${response.status}: ${text.slice(0, 200)}`);
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
}

export async function callProvider({ provider, env, model, systemPrompt, userPrompt, maxTokens }) {
  if (provider === "anthropic") {
    return callAnthropic({
      apiKey: env.SLOPCHECK_ANTHROPIC_KEY,
      model,
      systemPrompt,
      userPrompt,
      maxTokens,
    });
  }
  if (provider === "openai") {
    return callOpenAI({
      apiKey: env.SLOPCHECK_OPENAI_KEY,
      model,
      systemPrompt,
      userPrompt,
      maxTokens,
    });
  }
  if (provider === "google") {
    return callGoogle({
      apiKey: env.SLOPCHECK_GOOGLE_KEY,
      model,
      systemPrompt,
      userPrompt,
      maxTokens,
    });
  }
  throw new Error(`Unknown provider: ${provider}`);
}

export { jsonResponse };
