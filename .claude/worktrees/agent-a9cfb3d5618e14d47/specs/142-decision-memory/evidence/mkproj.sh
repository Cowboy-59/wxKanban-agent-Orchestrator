#!/usr/bin/env bash
# Make a throwaway project with the kit's Ask Gate + Change Impact hooks installed.
#   mkproj.sh <dir> <mode: observe|enforce> [--brainstorm]
set -euo pipefail
REPO="E:/AI_Development/wxperts/wxKanban"
DIR="$1"; MODE="$2"; EXTRA="${3:-}"
rm -rf "$DIR"; mkdir -p "$DIR/_wxAI" "$DIR/decisions" "$DIR/db" "$DIR/.claude"
cp -r "$REPO/_wxAI/askgate" "$DIR/_wxAI/"
cp -r "$REPO/_wxAI/impact" "$DIR/_wxAI/"
if [ "$EXTRA" = "--brainstorm" ]; then
  mkdir -p "$DIR/.claude/skills" "$DIR/docs/brainstorms"
  cp -r "$REPO/.claude/skills/wxBrainstorm" "$DIR/.claude/skills/"
fi
cd "$DIR"
git init -q; git config core.autocrlf false; git config user.email t@example.com; git config user.name t
printf 'gate:\n  mode: %s\n  matchThreshold: 0.5\n' "$MODE" > decisions/settings.yaml
printf 'alpha\n' > notes.txt
cat > "$DIR.d1.json" <<'EOF'
{"scope":"SCOPE-900","question":"How are endorsements prorated?","decision":"Daily, on the endorsement effective date.","rationale":"Matches the carrier's billing.","kind":"Agreed","evidence":"confirmed","source":"docs/brainstorms/2026-10-01-billing.md#1","date":"2026-10-01"}
EOF
node _wxAI/askgate/ledger.mjs append --file "$DIR.d1.json" --approved-by owner --root . >/dev/null
node _wxAI/impact/install-hook.mjs --root . >/dev/null
node _wxAI/askgate/install.mjs --root . >/dev/null
git add -A >/dev/null; git commit -qm base
echo "ready: $DIR ($MODE)"
