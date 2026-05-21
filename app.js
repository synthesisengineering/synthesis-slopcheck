// slopcheck: main app glue.
//
// Responsibilities:
// 1. Fetch the manifest from GitHub and load all skill files (cached per session).
// 2. Wire up the UI (provider, model, key, content, mode).
// 3. Hand off to the AnalysisOrchestrator (defined in orchestrator.js) which picks
//    the optimal strategy (single-pass vs multi-pass) based on the model's context
//    limit and runs the analysis.
// 4. Render progress updates and the final result.
//
// The full methodology is always applied: there is no "fast mode" vs "deep mode"
// user-facing toggle. The orchestrator handles context constraints internally.

const MANIFEST_URL =
  "https://raw.githubusercontent.com/synthesisengineering/synthesis-skills/main/tools/slop-detection/manifest.md";

const SKILL_CACHE_KEY = "slopcheck.skill-cache.v2";
const SKILL_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const STORAGE = {
  key: {
    session: "slopcheck.api-key.session",
    persistent: "slopcheck.api-key.persistent",
  },
  provider: "slopcheck.provider",
  model: "slopcheck.model",
  tier: "slopcheck.tier",
};

let el = {};
let skillContentCache = null; // { manifestText, skillContent: { [relativePath]: text }, timestamp }
let currentTier = "byok"; // "byok" (default) or "hosted"

function $(id) {
  return document.getElementById(id);
}

function init() {
  el = {
    tierRadios: document.querySelectorAll('input[name="tier"]'),
    provider: $("provider"),
    model: $("model"),
    modelHelp: $("model-help"),
    apiKey: $("api-key"),
    toggleKeyVisibility: $("toggle-key-visibility"),
    rememberKey: $("remember-key"),
    clearKey: $("clear-key"),
    content: $("content"),
    charCount: $("char-count"),
    analyzeButton: $("analyze-button"),
    status: $("status"),
    progressList: $("progress-list"),
    resultSection: $("result-section"),
    result: $("result"),
    copyResult: $("copy-result"),
    downloadResult: $("download-result"),
    byokOnlyEls: document.querySelectorAll(".byok-only"),
    hostedOnlyEls: document.querySelectorAll(".hosted-only"),
    hostedStatus: $("hosted-status"),
    hostedStatusText: $("hosted-status-text"),
  };

  setupTierSelect();
  setupProviderSelect();
  setupModelSelect();
  setupKeyPersistence();
  setupCharCount();
  setupAnalyze();
  setupResultActions();
}

// ---------- Tier selection ----------

function setupTierSelect() {
  const savedTier = localStorage.getItem(STORAGE.tier) || "byok";
  currentTier = savedTier;
  el.tierRadios.forEach((r) => {
    r.checked = r.value === savedTier;
    r.addEventListener("change", () => {
      if (r.checked) {
        currentTier = r.value;
        localStorage.setItem(STORAGE.tier, currentTier);
        applyTierUi();
        populateModelOptions();
      }
    });
  });
  applyTierUi();
}

function applyTierUi() {
  el.byokOnlyEls.forEach((node) => {
    node.style.display = currentTier === "byok" ? "" : "none";
  });
  el.hostedOnlyEls.forEach((node) => {
    node.style.display = currentTier === "hosted" ? "" : "none";
    if (currentTier === "hosted") node.hidden = false;
  });

  if (currentTier === "hosted") {
    const baseUrl = window.SLOPCHECK_HOSTED_TIER && window.SLOPCHECK_HOSTED_TIER.baseUrl;
    if (!baseUrl) {
      el.hostedStatusText.textContent =
        "Hosted tier is coming soon. For now, please bring your own API key or install the skills locally.";
      el.hostedStatus.classList.add("warning");
    } else {
      const limits = window.SLOPCHECK_HOSTED_TIER.limits;
      el.hostedStatusText.textContent =
        `Hosted tier active. ${limits.perIpDailyLimit} analyses per day. ` +
        `Documents up to ${limits.maxInputChars.toLocaleString()} characters. ` +
        `Cost-efficient models only.`;
      el.hostedStatus.classList.remove("warning");
    }
  }
}

// ---------- Provider and model selects ----------

function setupProviderSelect() {
  el.provider.innerHTML = "";
  Object.entries(window.SLOPCHECK_PROVIDERS).forEach(([id, p]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = p.name;
    el.provider.appendChild(opt);
  });

  const savedProvider = localStorage.getItem(STORAGE.provider) || "anthropic";
  el.provider.value = savedProvider;

  el.provider.addEventListener("change", () => {
    localStorage.setItem(STORAGE.provider, el.provider.value);
    populateModelOptions();
  });

  populateModelOptions();
}

function populateModelOptions() {
  const provider = window.SLOPCHECK_PROVIDERS[el.provider.value];
  if (!provider) return;
  el.model.innerHTML = "";

  // Filter models based on tier. Hosted tier restricts to cost-efficient models.
  const eligibleModels =
    currentTier === "hosted"
      ? provider.models.filter((m) => m.hostedTier)
      : provider.models;

  if (eligibleModels.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "No hosted-tier models for this provider";
    opt.disabled = true;
    el.model.appendChild(opt);
    if (el.modelHelp) {
      el.modelHelp.textContent =
        "Pick a different provider, or switch to BYOK for frontier models.";
    }
    return;
  }

  eligibleModels.forEach((m) => {
    const opt = document.createElement("option");
    opt.value = m.id;
    const contextStr = m.contextLimit ? ` [${(m.contextLimit / 1000).toFixed(0)}K context]` : "";
    opt.textContent = m.label + contextStr;
    el.model.appendChild(opt);
  });

  const savedModel = localStorage.getItem(STORAGE.model);
  const validModel = eligibleModels.find((m) => m.id === savedModel);
  if (validModel) {
    el.model.value = savedModel;
  } else {
    el.model.value = eligibleModels[0].id;
  }

  if (el.modelHelp) {
    if (currentTier === "hosted") {
      el.modelHelp.textContent =
        "Hosted tier offers cost-efficient models. For frontier models (Opus, GPT-5.5 Pro, Gemini 3.1 Pro), switch to BYOK.";
    } else {
      el.modelHelp.textContent = "";
    }
  }
}

function setupModelSelect() {
  el.model.addEventListener("change", () => {
    localStorage.setItem(STORAGE.model, el.model.value);
  });
}

// ---------- API key handling ----------

function setupKeyPersistence() {
  const persistentKey = localStorage.getItem(STORAGE.key.persistent);
  const sessionKey = sessionStorage.getItem(STORAGE.key.session);

  if (persistentKey) {
    el.apiKey.value = persistentKey;
    el.rememberKey.checked = true;
  } else if (sessionKey) {
    el.apiKey.value = sessionKey;
  }

  el.apiKey.addEventListener("input", () => {
    const key = el.apiKey.value;
    if (el.rememberKey.checked) {
      localStorage.setItem(STORAGE.key.persistent, key);
      sessionStorage.removeItem(STORAGE.key.session);
    } else {
      sessionStorage.setItem(STORAGE.key.session, key);
      localStorage.removeItem(STORAGE.key.persistent);
    }
  });

  el.rememberKey.addEventListener("change", () => {
    const key = el.apiKey.value;
    if (el.rememberKey.checked) {
      localStorage.setItem(STORAGE.key.persistent, key);
      sessionStorage.removeItem(STORAGE.key.session);
    } else {
      sessionStorage.setItem(STORAGE.key.session, key);
      localStorage.removeItem(STORAGE.key.persistent);
    }
  });

  el.toggleKeyVisibility.addEventListener("click", () => {
    if (el.apiKey.type === "password") {
      el.apiKey.type = "text";
      el.toggleKeyVisibility.textContent = "Hide";
    } else {
      el.apiKey.type = "password";
      el.toggleKeyVisibility.textContent = "Show";
    }
  });

  el.clearKey.addEventListener("click", () => {
    el.apiKey.value = "";
    localStorage.removeItem(STORAGE.key.persistent);
    sessionStorage.removeItem(STORAGE.key.session);
    el.rememberKey.checked = false;
    setStatus("Stored key cleared.");
  });
}

// ---------- Character count and URL-hash content prefill ----------

function setupCharCount() {
  const update = () => {
    el.charCount.textContent = el.content.value.length.toLocaleString();
  };
  el.content.addEventListener("input", update);
  update();

  if (window.location.hash && window.location.hash.startsWith("#content=")) {
    try {
      const encoded = window.location.hash.slice("#content=".length);
      const decoded = decodeURIComponent(encoded);
      if (decoded && !el.content.value) {
        el.content.value = decoded;
        update();
        history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    } catch (e) {
      // Ignore malformed hash; user can paste manually.
    }
  }
}

// ---------- Manifest and skill loading ----------

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  return await response.text();
}

async function loadAllSkillFiles() {
  if (skillContentCache && Date.now() - skillContentCache.timestamp < SKILL_CACHE_TTL_MS) {
    return skillContentCache;
  }
  const fromStorage = readSkillCacheFromStorage();
  if (fromStorage) {
    skillContentCache = fromStorage;
    return fromStorage;
  }

  setStatus("Fetching skill manifest from GitHub...");
  const manifestText = await fetchText(MANIFEST_URL);
  const urls = extractAllSkillUrls(manifestText);

  setStatus(`Fetching ${urls.length} skill files...`);
  const entries = await Promise.all(urls.map(async (url) => {
    const text = await fetchText(url);
    const relativePath = relativePathFromUrl(url);
    return [relativePath, text];
  }));

  const skillContent = Object.fromEntries(entries);
  const payload = { manifestText, skillContent, timestamp: Date.now() };
  skillContentCache = payload;
  writeSkillCacheToStorage(payload);
  setStatus("Skills loaded.");
  return payload;
}

function extractAllSkillUrls(manifestText) {
  // Extract every skill-file URL in the manifest, regardless of section.
  // The web app uses the full methodology; the orchestrator decides how to apply it.
  const urlPattern =
    /https:\/\/raw\.githubusercontent\.com\/synthesisengineering\/synthesis-skills\/[^\s)]+\.md/g;
  const seen = new Set();
  const ordered = [];
  for (const url of manifestText.match(urlPattern) || []) {
    if (!seen.has(url)) {
      seen.add(url);
      ordered.push(url);
    }
  }
  return ordered;
}

function relativePathFromUrl(url) {
  // Convert https://raw.githubusercontent.com/.../main/<path> to <path>.
  const match = url.match(/\/main\/(.+)$/);
  return match ? match[1] : url;
}

function readSkillCacheFromStorage() {
  try {
    const raw = sessionStorage.getItem(SKILL_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Date.now() - parsed.timestamp > SKILL_CACHE_TTL_MS) {
      sessionStorage.removeItem(SKILL_CACHE_KEY);
      return null;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

function writeSkillCacheToStorage(payload) {
  try {
    sessionStorage.setItem(SKILL_CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    // sessionStorage may be at quota for very large payloads. Cache in memory is fine.
  }
}

// ---------- Analysis flow ----------

function setupAnalyze() {
  el.analyzeButton.addEventListener("click", runAnalysis);
}

function getCurrentMode() {
  const modeRadio = document.querySelector('input[name="mode"]:checked');
  return modeRadio ? modeRadio.value : "artifact";
}

async function runAnalysis() {
  const provider = window.SLOPCHECK_PROVIDERS[el.provider.value];
  if (!provider) {
    setStatus("Unknown provider.", true);
    return;
  }

  const apiKey = el.apiKey.value.trim();
  const model = el.model.value;
  const content = el.content.value.trim();
  const mode = getCurrentMode();

  // Tier-specific validation.
  if (currentTier === "byok") {
    if (!apiKey) {
      setStatus("API key required for BYOK. Either paste a key, or switch to the hosted tier.", true);
      el.apiKey.focus();
      return;
    }
  } else if (currentTier === "hosted") {
    const limits = window.SLOPCHECK_HOSTED_TIER && window.SLOPCHECK_HOSTED_TIER.limits;
    if (limits && content.length > limits.maxInputChars) {
      setStatus(
        `Hosted tier supports up to ${limits.maxInputChars.toLocaleString()} characters. ` +
          `Your content is ${content.length.toLocaleString()}. BYOK for longer documents.`,
        true
      );
      return;
    }
    if (!window.SLOPCHECK_HOSTED_TIER || !window.SLOPCHECK_HOSTED_TIER.baseUrl) {
      setStatus(
        "Hosted tier is not yet deployed. Please BYOK or install the skills locally.",
        true
      );
      return;
    }
  }

  if (!content) {
    setStatus("Content required.", true);
    el.content.focus();
    return;
  }

  el.analyzeButton.disabled = true;
  el.result.innerHTML = "";
  el.resultSection.hidden = true;
  if (el.progressList) {
    el.progressList.innerHTML = "";
    el.progressList.hidden = false;
  }
  setStatus("Loading skills...");

  try {
    const skillCache = await loadAllSkillFiles();

    // Build the analyze function the orchestrator will call. For BYOK, this is
    // provider.analyze with the user's key. For hosted tier, this is the Worker
    // proxy. The orchestrator treats both identically.
    const tierProvider = buildTierProvider({ provider, providerId: el.provider.value, apiKey });

    const orchestrator = new window.SLOPCHECK_ORCHESTRATOR_CLASS({
      provider: tierProvider,
      model,
      apiKey: currentTier === "byok" ? apiKey : "<hosted>",
      manifestSkillContent: skillCache.skillContent,
    });

    el.resultSection.hidden = false;
    el.result.innerHTML = '<span class="thinking">Analyzing</span>';

    const partialResults = [];
    const finalText = await orchestrator.analyze({
      userContent: content,
      mode,
      onProgress: (event) => handleProgress(event, partialResults),
    });

    renderResult(finalText);
    setStatus("Analysis complete.");
  } catch (error) {
    console.error(error);
    setStatus(error.message || "Analysis failed.", true);
    el.resultSection.hidden = false;
    el.result.innerHTML =
      '<p style="color:#a02020">' + escapeHtml(error.message || "Unknown error") + "</p>";
  } finally {
    el.analyzeButton.disabled = false;
  }
}

function buildTierProvider({ provider, providerId, apiKey }) {
  // BYOK: orchestrator uses the provider's direct analyze with the user's key.
  if (currentTier === "byok") {
    return provider;
  }

  // Hosted tier: wrap the provider so its `analyze` calls go through the Worker.
  // The orchestrator passes (apiKey, model, systemPrompt, userPrompt, maxTokens);
  // we ignore apiKey here and route through the hosted-tier adapter, which adds
  // the Turnstile token and provider routing.
  const hosted = window.SLOPCHECK_HOSTED_TIER;
  return {
    ...provider,
    analyze: async ({ model, systemPrompt, userPrompt, maxTokens, userContent }) => {
      const turnstileToken = await getTurnstileToken();
      return hosted.analyze({
        providerId,
        model,
        systemPrompt,
        userPrompt,
        maxTokens,
        turnstileToken,
        userContent,
      });
    },
  };
}

// Turnstile widget is rendered explicitly when the user first selects the
// hosted tier. The widget id is cached so subsequent calls just re-execute.
let turnstileWidgetId = null;

window.onTurnstileLoad = function () {
  // The Turnstile script calls this when it's loaded. We render the widget
  // explicitly the first time the hosted tier is actually used (see
  // getTurnstileToken below) so BYOK users never invoke any captcha.
};

async function getTurnstileToken() {
  if (!window.turnstile || typeof window.turnstile.render !== "function") {
    // Script hasn't loaded yet, or the page is offline. Return empty; the
    // Function will reject and the user can refresh and try again.
    return "";
  }

  const widgetContainer = document.getElementById("turnstile-widget");
  if (!widgetContainer) return "";

  const siteKey = widgetContainer.getAttribute("data-sitekey");
  if (!siteKey || siteKey === "REPLACE_WITH_TURNSTILE_SITE_KEY") {
    // Turnstile site key isn't configured. Skip — the Function will accept
    // when TURNSTILE_SECRET_KEY is also unset, useful for local dev.
    return "";
  }

  if (turnstileWidgetId === null) {
    turnstileWidgetId = window.turnstile.render(widgetContainer, {
      sitekey: siteKey,
      size: widgetContainer.getAttribute("data-size") || "invisible",
    });
  }

  return new Promise((resolve) => {
    try {
      window.turnstile.execute(turnstileWidgetId, {
        callback: (token) => resolve(token),
        "error-callback": () => resolve(""),
        "timeout-callback": () => resolve(""),
      });
    } catch (e) {
      resolve("");
    }
  });
}

function handleProgress(event, partialResults) {
  if (!event) return;
  if (event.stage === "planning" || event.stage === "strategy") {
    setStatus(event.message);
    appendProgressItem(event.message);
    return;
  }
  if (event.stage === "pass") {
    setStatus(event.message);
    appendProgressItem(event.message);
    return;
  }
  if (event.stage === "pass-complete" && event.partial) {
    partialResults.push(event.partial);
    appendProgressItem(`✓ ${event.message}`);
    return;
  }
  if (event.stage === "complete") {
    setStatus(event.message);
    appendProgressItem(`✓ ${event.message}`);
    return;
  }
}

function appendProgressItem(message) {
  if (!el.progressList) return;
  const item = document.createElement("li");
  item.textContent = message;
  el.progressList.appendChild(item);
}

function renderResult(markdownText) {
  if (window.marked) {
    window.marked.setOptions({ breaks: true, gfm: true });
    el.result.innerHTML = window.marked.parse(markdownText);
  } else {
    el.result.innerHTML = "<pre>" + escapeHtml(markdownText) + "</pre>";
  }
  el.result.dataset.rawMarkdown = markdownText;
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function setStatus(text, isError = false) {
  el.status.textContent = text || "";
  if (isError) {
    el.status.classList.add("error");
  } else {
    el.status.classList.remove("error");
  }
}

// ---------- Result actions ----------

function setupResultActions() {
  el.copyResult.addEventListener("click", () => {
    const md = el.result.dataset.rawMarkdown || "";
    if (!md) return;
    navigator.clipboard.writeText(md).then(
      () => setStatus("Copied to clipboard."),
      () => setStatus("Copy failed.", true)
    );
  });

  el.downloadResult.addEventListener("click", () => {
    const md = el.result.dataset.rawMarkdown || "";
    if (!md) return;
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `slopcheck-${timestamp}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
}

// ---------- Boot ----------

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
