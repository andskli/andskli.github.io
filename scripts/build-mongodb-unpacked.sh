#!/usr/bin/env bash
# Build the standalone app into Zola's static directory.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT/apps/mongodb-unpacked"

npm ci --no-audit --no-fund
npm run format:check
npm test
npm run build:site
