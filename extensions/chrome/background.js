// Slopcheck Chrome / Edge extension — service worker.
//
// Two entry points:
// 1. Right-click context menu on selected text. The selection is passed via
//    URL hash to the hosted web app, which pre-fills the textarea.
// 2. Toolbar icon → popup.html. The popup grabs the current page's selection
//    (or visible content) and opens the same flow.
//
// No content is sent anywhere by this extension. Everything goes through the
// open source slopcheck web app at tools.synthesiswriting.org/slopcheck. The
// user controls the choice of BYOK vs hosted tier from there.

const SLOPCHECK_URL = "https://tools.synthesiswriting.org/slopcheck";
const MAX_PREFILL_CHARS = 8000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "slopcheck-selection",
    title: "Slopcheck this selection",
    contexts: ["selection"],
  });
  chrome.contextMenus.create({
    id: "slopcheck-page",
    title: "Slopcheck this page",
    contexts: ["page"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "slopcheck-selection" && info.selectionText) {
    openSlopcheckWith(info.selectionText);
    return;
  }
  if (info.menuItemId === "slopcheck-page" && tab && tab.id) {
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const sel = window.getSelection ? window.getSelection().toString() : "";
          if (sel && sel.trim().length > 0) return sel;
          return (document.body && document.body.innerText) || "";
        },
      });
      openSlopcheckWith(result || "");
    } catch (e) {
      openSlopcheckWith("");
    }
  }
});

function openSlopcheckWith(text) {
  const trimmed = (text || "").slice(0, MAX_PREFILL_CHARS);
  const url =
    trimmed.length > 0
      ? `${SLOPCHECK_URL}#content=${encodeURIComponent(trimmed)}`
      : SLOPCHECK_URL;
  chrome.tabs.create({ url });
}
