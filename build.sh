#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
case "${1:-cloudflare}" in
  cloudflare|local|build)
    # The page's install section must show the published commands and nothing from the retired 4.x installer.
    python3 -m unittest -q tests/test_installation_copy.py
    ;;
  *)
    echo "Usage: $0 {local|cloudflare}" >&2
    exit 2
    ;;
esac
