#!/usr/bin/env bash
# Slopcheck one-line installer.
#
# Usage:
#   curl -fsSL https://tools.synthesiswriting.org/slopcheck/install.sh | sh
#
# What it does:
#   1. Checks for Python 3.
#   2. Downloads the slopcheck CLI Python script.
#   3. Installs it to ~/.local/bin/slopcheck (or /usr/local/bin if writable).
#   4. Suggests installing the full synthesis-skills suite via the main
#      install.sh from synthesis-engineering.
#
# What it does NOT do:
#   - It does NOT install the synthesis-skills suite automatically. The suite
#     installer is a separate one-liner; we suggest it but never run it
#     without explicit user action.
#   - It does NOT modify PATH; if ~/.local/bin is not on PATH, it tells the
#     user how to add it.

set -euo pipefail

CLI_URL="https://raw.githubusercontent.com/synthesisengineering/synthesis-slopcheck/main/cli/slopcheck.py"
DEFAULT_INSTALL_DIR="${HOME}/.local/bin"

err() { echo "slopcheck install: $*" >&2; }
say() { echo "slopcheck install: $*"; }

if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then
  err "Python 3 is required. Install it from https://www.python.org/downloads and try again."
  exit 2
fi

INSTALL_DIR="${SLOPCHECK_INSTALL_DIR:-$DEFAULT_INSTALL_DIR}"
mkdir -p "$INSTALL_DIR"

TARGET="${INSTALL_DIR}/slopcheck"
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

say "Downloading the slopcheck CLI..."
if ! curl -fsSL "$CLI_URL" -o "$TMP"; then
  err "Failed to download from $CLI_URL"
  exit 2
fi

# Add a shebang wrapper so the file is directly executable.
{
  echo '#!/usr/bin/env python3'
  # Strip the existing shebang if present, then emit the rest.
  sed '1{/^#!/d;}' "$TMP"
} > "$TARGET"
chmod 0755 "$TARGET"

say "Installed at $TARGET"

# Check PATH.
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    say "Add $INSTALL_DIR to your PATH. For zsh / bash:"
    say "    echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.zshrc   # or ~/.bashrc"
    say "    exec \$SHELL -l"
    ;;
esac

say "Try it now:"
say "    slopcheck --list-models"
say ""
say "Open source: https://github.com/synthesisengineering/synthesis-slopcheck"
say "Web app:     https://tools.synthesiswriting.org/slopcheck"
say "Support:     https://www.patreon.com/rajivpant"
say ""
say "To also install the full open source synthesis-skills suite into your AI"
say "agent (Claude Code, Codex, Cursor):"
say "    curl -fsSL https://synthesisengineering.org/install.sh | sh"
