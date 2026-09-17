// Generated from synthesiswork-site/shared-site/InstallationGuide.astro.
for (const guide of document.querySelectorAll("[data-install-guide]")) {
  if (guide.dataset.enhanced === "true") continue;
  const selector = guide.querySelector("[data-install-profile]");
  const tablist = guide.querySelector("[data-install-tabs]");
  const tabs = Array.from(guide.querySelectorAll("[data-channel-tab]"));
  const profiles = Array.from(guide.querySelectorAll("[data-profile-panel]"));
  const status = guide.querySelector("[data-install-status]");
  if (!selector || !tablist || !tabs.length || !profiles.length || !status) continue;
  let activeChannel = "agent";
  const skillSelector = guide.querySelector("[data-install-skill]");
  const noCore = guide.querySelector("[data-no-dormant-core]");
  const refreshCommands = () => {
    const skill = skillSelector?.value;
    const allowed = skillSelector ? Array.from(skillSelector.options).map((option) => option.value) : [];
    for (const code of guide.querySelectorAll("[data-default-command]")) {
      let command = noCore?.checked && code.dataset.optoutCommand ? code.dataset.optoutCommand : code.dataset.defaultCommand ?? "";
      if (code.dataset.skillTemplate && skill && allowed.includes(skill)) command = command.replaceAll(code.dataset.skillTemplate, skill);
      code.textContent = command;
    }
  };
  skillSelector?.addEventListener("change", refreshCommands);
  noCore?.addEventListener("change", refreshCommands);
  const selectChannel = (channel, focus = false) => {
    activeChannel = channel;
    const selectedProfile = profiles.find((profile) => profile.dataset.profilePanel === selector.value);
    if (!selectedProfile) return;
    const modular = selector.value === "modular";
    const modularOrTool = !["full", "skills-only"].includes(selector.value);
    for (const node of guide.querySelectorAll("[data-skill-control]")) node.hidden = !modular;
    for (const attribute of ["data-core-control", "data-core-note"]) for (const node of guide.querySelectorAll(`[${attribute}]`)) node.hidden = !modularOrTool;
    refreshCommands();
    for (const profile of profiles) {
      profile.hidden = profile !== selectedProfile;
      for (const panel of profile.querySelectorAll("[data-channel-panel]")) {
        panel.hidden = panel.dataset.channelPanel !== channel;
        panel.setAttribute("role", "tabpanel");
        panel.tabIndex = 0;
        const tab = tabs.find((candidate) => candidate.dataset.channelTab === panel.dataset.channelPanel);
        if (tab) panel.setAttribute("aria-labelledby", tab.id);
      }
    }
    for (const tab of tabs) {
      const selected = tab.dataset.channelTab === channel;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      const panel = Array.from(selectedProfile.querySelectorAll("[data-channel-panel]")).find((candidate) => candidate.dataset.channelPanel === tab.dataset.channelTab);
      if (panel) tab.setAttribute("aria-controls", panel.id);
      if (selected && focus) tab.focus();
    }
  };
  selector.addEventListener("change", () => {
    selectChannel(activeChannel);
    status.textContent = `${selector.selectedOptions[0].textContent} selected.`;
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => selectChannel(tab.dataset.channelTab ?? "agent"));
    tab.addEventListener("keydown", (event) => {
      let next = index;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = tabs.length - 1;
      else return;
      event.preventDefault();
      selectChannel(tabs[next].dataset.channelTab ?? "agent", true);
    });
  });
  const findCopyTarget = (id) => Array.from(guide.querySelectorAll("code[id]")).find((candidate) => candidate.id === id);
  const selectText = (target) => {
    target.focus();
    const selection = window.getSelection();
    if (!selection) return false;
    const range = document.createRange();
    range.selectNodeContents(target);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  };
  for (const button of guide.querySelectorAll("[data-copy-target]")) {
    button.addEventListener("click", async () => {
      const target = findCopyTarget(button.dataset.copyTarget);
      if (!target) return;
      try {
        await navigator.clipboard.writeText(target.textContent?.trim() ?? "");
        status.textContent = "Copied to clipboard.";
      } catch {
        status.textContent = selectText(target) ? "Clipboard unavailable. Text selected; use your copy shortcut." : "Clipboard unavailable. Select the visible text and use your copy shortcut.";
      }
    });
  }
  for (const button of guide.querySelectorAll("[data-select-target]")) {
    button.addEventListener("click", () => {
      const target = findCopyTarget(button.dataset.selectTarget);
      if (!target) return;
      status.textContent = selectText(target) ? "Text selected; use your copy shortcut." : "Select the visible text and use your copy shortcut.";
    });
  }
  selector.value = guide.dataset.defaultProfile ?? "full";
  selectChannel("agent");
  guide.querySelector("[data-profile-control]")?.removeAttribute("hidden");
  for (const actions of guide.querySelectorAll("[data-copy-actions]")) actions.hidden = false;
  guide.querySelector("[data-selection-options]")?.removeAttribute("hidden");
  tablist.hidden = false;
  guide.dataset.enhanced = "true";
}
