#!/bin/bash
set -euo pipefail
SITE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SITE_ROOT"
case "${1:-final}" in
  final) bash build.sh cloudflare ;;
  first-publish-immutable-bootstrap) bash build.sh cloudflare-first-publish ;;
  *) echo "Choose final or first-publish-immutable-bootstrap." >&2; exit 2 ;;
esac
npx wrangler pages deploy "$SITE_ROOT" --project-name=slopcheck --branch=main
