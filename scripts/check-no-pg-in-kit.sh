#!/usr/bin/env bash
# spec 028 / T055 — CI gate: forbid Postgres deps in the kit archive surface.
#
# Runs against the assembled staging directory (default: ./staging) and fails
# the build if any of the following are present:
#
#   1. Any package.json declares `pg`, `postgres`, `drizzle-orm`, or
#      `drizzle-kit` in dependencies / devDependencies.
#   2. The staging tree contains an `mcp-server/` directory or any file
#      matching `mcp-server/src/db/connection.ts` (the BUG-20 surface).
#
# After spec 019 Decision #1 + Decision #2, the kit is an HTTPS client only.
# A regression that re-adds these would re-introduce BUG-20.
#
# Usage:
#   scripts/check-no-pg-in-kit.sh [staging-dir]
#
# Exit codes:
#   0 — clean
#   1 — forbidden dep / path found
#   2 — staging dir missing

set -euo pipefail

STAGING="${1:-staging}"

if [ ! -d "$STAGING" ]; then
  echo "ERROR: staging directory '$STAGING' not found" >&2
  exit 2
fi

errors=0

# --- Check 1: forbidden npm deps -------------------------------------------
echo "[check-no-pg-in-kit] scanning package.json files under $STAGING ..."
while IFS= read -r -d '' pkg; do
  for dep in '"pg"' '"postgres"' '"drizzle-orm"' '"drizzle-kit"'; do
    if grep -q "$dep[[:space:]]*:" "$pkg"; then
      echo "ERROR: forbidden dep $dep found in $pkg" >&2
      errors=$((errors + 1))
    fi
  done
done < <(find "$STAGING" -type f -name 'package.json' -not -path '*/node_modules/*' -print0)

# --- Check 2: forbidden paths ----------------------------------------------
echo "[check-no-pg-in-kit] scanning forbidden paths under $STAGING ..."
if [ -d "$STAGING/mcp-server" ]; then
  echo "ERROR: $STAGING/mcp-server/ directory present (kit is HTTPS-client only per spec 019 Decision #1)" >&2
  errors=$((errors + 1))
fi

while IFS= read -r -d '' f; do
  echo "ERROR: forbidden file present in kit: $f" >&2
  errors=$((errors + 1))
done < <(find "$STAGING" -type f \( \
    -path '*/mcp-server/src/db/connection.ts' -o \
    -path '*/mcp-server/dist/db/connection.js' -o \
    -name 'setup-mcp.mjs' -o \
    -name 'mcp-health-check.mjs' \
  \) -print0)

if [ "$errors" -gt 0 ]; then
  echo "" >&2
  echo "FAIL: $errors forbidden item(s) found. The kit must not ship pg/drizzle-orm or mcp-server/ (BUG-20 surface)." >&2
  exit 1
fi

echo "OK: no Postgres deps, no mcp-server tree, no legacy MCP scripts in $STAGING."
