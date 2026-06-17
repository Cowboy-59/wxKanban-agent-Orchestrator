#!/usr/bin/env bash
# [SCOPE 058 / T024] BEGIN — wxAIGit merge: merge a scope/* branch into the
# integration branch (FR-009). Backs `wxAIGit merge --source-branch <branch>`
# for the scope check-in flow. Mirrors gitpro-merge's CORE semantic (switch to
# integration, merge source) but deliberately drops the version bump / tag /
# PUSH — a scope check-in merge is a safe LOCAL merge; the user controls when to
# push (git-timeline rule). --no-ff keeps a "Merge branch 'scope/NNN-...'"
# subject so the FR-007 post-merge hook can still derive the scope to release.
set -euo pipefail

SOURCE=""
INTO=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --source-branch) SOURCE="${2:-}"; shift 2 ;;
    --into) INTO="${2:-}"; shift 2 ;;
    *) echo "wxAIGit merge: unsupported option '$1'" >&2; exit 2 ;;
  esac
done

if [[ -z "$SOURCE" ]]; then
  echo "Usage: wxAIGit merge --source-branch <branch> [--into <branch>]" >&2
  exit 2
fi

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  echo "wxAIGit merge: not inside a git repository." >&2
  exit 1
fi

# Default integration branch: main, then master, else the current branch.
if [[ -z "$INTO" ]]; then
  if git show-ref --verify --quiet refs/heads/main; then
    INTO="main"
  elif git show-ref --verify --quiet refs/heads/master; then
    INTO="master"
  else
    INTO="$(git rev-parse --abbrev-ref HEAD)"
  fi
fi

if [[ "$SOURCE" == "$INTO" ]]; then
  echo "wxAIGit merge: source and integration branch are both '$INTO' — nothing to merge." >&2
  exit 2
fi

git checkout "$INTO"
git merge --no-ff --no-edit "$SOURCE"
echo "wxAIGit: merged '$SOURCE' into '$INTO' (local only — push when ready)."
# [SCOPE 058 / T024] END
