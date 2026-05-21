#!/usr/bin/env node
// Postinstall: confirm Python 3 is available, and offer to install the full
// synthesis-skills suite (the cross-promotion decision from the project's
// REFERENCE.md).
//
// The npm package vendors the Python CLI directly (no network fetch on
// install). The skills are not bundled — they live in the user's AI agent
// directory (~/.claude/skills, ~/.codex/skills, ~/.agents/skills) and are
// installed via the existing synthesis-skills install.sh script if the user
// opts in.

const { spawnSync } = require("node:child_process");

function tryPython() {
  for (const candidate of ["python3", "python"]) {
    try {
      const result = spawnSync(candidate, ["--version"], { stdio: "ignore" });
      if (result.status === 0) return candidate;
    } catch (e) {
      // try next
    }
  }
  return null;
}

const python = tryPython();
if (!python) {
  console.warn(
    "\nslopcheck installed, but Python 3 was not found on PATH."
  );
  console.warn(
    "Install Python 3 before running slopcheck: https://www.python.org/downloads"
  );
}

console.log(`
slopcheck (CLI) is installed.

Quick start:
  slopcheck --list-models
  slopcheck --provider anthropic --model claude-haiku-4-5-20251001 < your-file.md

You can also install the full open source synthesis-skills suite into your AI
agent (Claude Code, Codex, Cursor) for use without the CLI:

  curl -fsSL https://synthesisengineering.org/install.sh | sh

Open source: https://github.com/synthesisengineering/synthesis-slopcheck
Hosted web app: https://tools.synthesiswriting.org/slopcheck
Support the work: https://github.com/sponsors/rajivpant
`);
