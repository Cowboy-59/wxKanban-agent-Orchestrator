#!/usr/bin/env bash
# pack-kit.sh — build a distributable tarball for wxkanban-agent.
#
# Output: ./wxkanban-agent-<version>.tgz at the repo root.
# Excludes: node_modules, dist, test artifacts, .git, IDE folders.
#
# Usage:
#   bash scripts/pack-kit.sh
#
# After packing, consumers install with:
#   npm install ./wxkanban-agent-<version>.tgz

set -euo pipefail

cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
NAME="$(node -p "require('./package.json').name")"
TARBALL="${NAME}-${VERSION}.tgz"

echo "Packing ${NAME} v${VERSION}..."

REQUIRED_FILES=(
  "package.json"
  "tsconfig.json"
  "README.md"
  "core"
  "apps"
  "workers"
  "adapters"
  "services"
  "scripts"
  "templates"
  "docs"
  "dbpush.ts"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [ ! -e "$f" ]; then
    echo "ERROR: required path missing: $f" >&2
    exit 1
  fi
done

REQUIRED_TEMPLATES=(
  "templates/migrations/0001-026-codefencing.sql"
  "templates/CLAUDE.md.fencing-snippet.md"
  "templates/auditfences-github-action.yml"
  "templates/schema/taskfences.ts"
  "templates/schema/taskfencemodifications.ts"
  "templates/schema/taskfencehistory.ts"
  "templates/schema/taskfenceslegacy.ts"
)

for f in "${REQUIRED_TEMPLATES[@]}"; do
  if [ ! -e "$f" ]; then
    echo "ERROR: required spec 026 template missing: $f" >&2
    exit 1
  fi
done

REQUIRED_DOCS=(
  "docs/implement.md"
  "docs/fencing.md"
)

for f in "${REQUIRED_DOCS[@]}"; do
  if [ ! -e "$f" ]; then
    echo "ERROR: required doc missing: $f" >&2
    exit 1
  fi
done

if [ -d node_modules ]; then
  echo "(skipping node_modules — npm pack would also exclude it)"
fi

if command -v npm >/dev/null 2>&1; then
  # Remove any stale tarballs first so the repo root only ever holds the
  # tarball for the CURRENT version — a lingering older-version .tgz is
  # exactly how a kit change goes unnoticed by consumers.
  for old in ../${NAME}-v*.tgz ../${NAME}-[0-9]*.tgz; do
    [ -e "$old" ] || continue
    case "$old" in
      "../${NAME}-v${VERSION}.tgz") ;;  # keep the one we're about to (re)create
      *) echo "Removing stale tarball: $old"; rm -f "$old" ;;
    esac
  done

  npm pack --pack-destination ..
  mv "../${TARBALL}" "../${NAME}-v${VERSION}.tgz"
  echo ""
  echo "Tarball: ../${NAME}-v${VERSION}.tgz"
  echo "Install in consumer: npm install ../${NAME}-v${VERSION}.tgz"
else
  echo "ERROR: npm not found in PATH" >&2
  exit 1
fi
