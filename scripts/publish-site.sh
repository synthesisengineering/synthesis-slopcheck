#!/bin/bash
set -euo pipefail
SITE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SITE_ROOT"
bash build.sh cloudflare
npx wrangler pages deploy "$SITE_ROOT" --project-name=slopcheck --branch=main
