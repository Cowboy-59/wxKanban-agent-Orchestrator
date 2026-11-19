#!/usr/bin/env bash
# Spec 028 / T011 — CI grep gate.
#
# Forbids direct `db.select/insert/update/delete` outside the scoped-query
# module and explicit bootstrap paths. Run as part of the kit's CI pipeline.
#
# Exits 0 if clean, 1 if any forbidden call site is found.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_DIR="$ROOT/src"

# Allow direct db.* inside these files only.
ALLOW='src/db/scoped-query\.ts|src/db/connection\.ts|src/middleware/auth\.ts|src/middleware/audit\.ts|src/index-http\.ts'

# Findings (skipping comments / strings is best-effort with grep).
matches=$(grep -RnE 'db\.(select|insert|update|delete)\b' "$SERVER_DIR" \
  --include='*.ts' \
  | grep -vE "$ALLOW" || true)

if [ -n "$matches" ]; then
  echo "ERROR: direct db.{select,insert,update,delete} call outside scoped-query.ts:" >&2
  echo "$matches" >&2
  exit 1
fi

echo "OK: no direct DB call sites outside the allowlist."
