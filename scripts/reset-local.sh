#!/usr/bin/env bash
# Wipes LOCAL development data only (.wrangler/state) and re-applies migrations. Never touches remote D1/R2.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf .wrangler/state tests/e2e/.artifacts/admin-127_0_0_1_4173.json
npx wrangler d1 migrations apply lynto-db --local
