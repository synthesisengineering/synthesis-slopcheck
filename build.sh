#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
case "${1:-cloudflare}" in
  cloudflare|cloudflare-first-publish)
    installation_mode=final
    if [[ "${1:-cloudflare}" == "cloudflare-first-publish" ]]; then installation_mode=first-publish-immutable-bootstrap; fi
    node --check installation.js
    node installation/check-installation-release.mjs --mode "$installation_mode" --surface slopcheck --html index.html
    ;;
  local|build)
    node --check installation.js
    ;;
  *)
    echo "Usage: $0 {local|cloudflare|cloudflare-first-publish}" >&2
    exit 2
    ;;
esac
