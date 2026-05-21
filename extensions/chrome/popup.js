// Slopcheck extension popup logic.
//
// Three actions:
// 1. "Slopcheck this page" — runs a content script that pulls visible text.
// 2. "Slopcheck my selection" — runs a content script that pulls the current selection.
// 3. "Slopcheck this text" — uses the text from the popup textarea directly.

const SLOPCHECK_URL = "https://tools.synthesiswriting.org/slopcheck";
const MAX_PREFILL_CHARS = 8000;

document.getElementById("check-page").addEventListener("click", async () => {
  const text = await grabFromActiveTab(() => {
    return (document.body && document.body.innerText) || "";
  });
  openSlopcheckWith(text);
});

document.getElementById("check-selection").addEventListener("click", async () => {
  const text = await grabFromActiveTab(() => {
    return window.getSelection ? window.getSelection().toString() : "";
  });
  openSlopcheckWith(text);
});

document.getElementById("check-paste").addEventListener("click", () => {
  const text = document.getElementById("paste-area").value || "";
  openSlopcheckWith(text);
});

async function grabFromActiveTab(scriptFn) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) return "";
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scriptFn,
    });
    return result || "";
  } catch (e) {
    return "";
  }
}

function openSlopcheckWith(text) {
  const trimmed = (text || "").trim().slice(0, MAX_PREFILL_CHARS);
  const url =
    trimmed.length > 0
      ? `${SLOPCHECK_URL}#content=${encodeURIComponent(trimmed)}`
      : SLOPCHECK_URL;
  chrome.tabs.create({ url });
  window.close();
}
