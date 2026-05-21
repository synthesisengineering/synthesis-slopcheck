#!/usr/bin/env node
// Thin wrapper that runs the vendored Python CLI.
//
// The actual logic lives in the Python file at `vendor/slopcheck.py` (copied
// from `synthesis-slopcheck/cli/slopcheck.py` at build time). This wrapper
// only locates Python 3 and forwards arguments.

const { spawn } = require("node:child_process");
const path = require("node:path");
const { existsSync } = require("node:fs");

const PYTHON_CANDIDATES = ["python3", "python"];

function findPython() {
  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const result = require("node:child_process").spawnSync(candidate, ["--version"], {
        stdio: "ignore",
      });
      if (result.status === 0) return candidate;
    } catch (e) {
      // try next
    }
  }
  return null;
}

function main() {
  const python = findPython();
  if (!python) {
    console.error(
      "slopcheck requires Python 3. Install it from https://www.python.org/downloads or your package manager, then try again."
    );
    process.exit(2);
  }

  const scriptPath = path.join(__dirname, "..", "vendor", "slopcheck.py");
  if (!existsSync(scriptPath)) {
    console.error(
      `slopcheck CLI not found at ${scriptPath}. Reinstall the package: npm install -g @synthesisengineering/slopcheck`
    );
    process.exit(2);
  }

  const args = process.argv.slice(2);
  const child = spawn(python, [scriptPath, ...args], { stdio: "inherit" });
  child.on("exit", (code) => process.exit(code ?? 0));
  child.on("error", (err) => {
    console.error("Failed to start slopcheck:", err.message);
    process.exit(2);
  });
}

main();
