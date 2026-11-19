#!/usr/bin/env bash
# [SCOPE 058 / T024] BEGIN — wxAIGit branch: create-if-absent + switch.
# Backs `wxAIGit branch --create <name>` for the scope check-out flow (FR-009).
# If the branch exists we switch to it; otherwise we create and switch. Local
# only — no push. Any option other than --create is rejected (KISS: SPEC-058
# needs only --create).
set -euo pipefail

ACTION=""
NAME=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --create) ACTION="create"; NAME="${2:-}"; shift 2 ;;
    *) echo "wxAIGit branch: unsupported option '$1' (only --create <name>)" >&2; exit 2 ;;
  esac
done

if [[ "$ACTION" != "create" || -z "$NAME" ]]; then
  echo "Usage: wxAIGit branch --create <name>" >&2
  exit 2
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "wxAIGit branch: not inside a git repository." >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$NAME"; then
  git checkout "$NAME"
  echo "wxAIGit: switched to existing branch '$NAME'."
else
  git checkout -b "$NAME"
  echo "wxAIGit: created and switched to '$NAME'."
fi
# [SCOPE 058 / T024] END
