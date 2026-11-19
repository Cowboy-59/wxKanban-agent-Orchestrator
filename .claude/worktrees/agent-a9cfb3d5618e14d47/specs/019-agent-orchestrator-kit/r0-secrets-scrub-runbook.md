# R0 Secrets Scrub Runbook — wxKanban-agent-Orchestrator Repo

**Source spec**: [`../Project-Scope/019-agent-orchestrator-kit.md`](../Project-Scope/019-agent-orchestrator-kit.md) — Requirement 0
**Target repo**: [`Cowboy-59/wxKanban-agent-Orchestrator`](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator)
**Status**: ⚠️ DEFERRED — owner-accepted risk (2026-04-09). DB password rotation deferred to a future date. Resume by saying "run R0".
**Date**: 2026-04-09 (deferred 2026-04-09)

---

## Why this runbook exists

While auditing the orchestrator repo for spec 019, three categories of credential exposure were found in the public main branch:

| File | What it contains | Risk class |
|---|---|---|
| [`.env`](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/blob/main/.env) | 1191 bytes — likely real environment variables | **High** if any are live |
| [`mcp-server/decrypted-url.txt`](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/blob/main/mcp-server/decrypted-url.txt) | A *decrypted* DB connection URL | **Critical** if the DB is real |
| [`ai-settings.json`](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator/blob/main/ai-settings.json) | Contains `WXKANBAN_API_TOKEN: -cv4lzTW...` and `DATABASE_URL_ENCRYPTED: 4d5f6d7a...` | **High** for the API token; **Medium** for the encrypted URL (encrypted, but decryption key may be findable) |

Spec 019 Decision #4 establishes that `WXKANBAN_API_TOKEN` is generated **per project at install time**, so any token committed in the kit template is by definition a placeholder that should look like `"{{generated_at_init}}"`, not a real-looking 27-character base64 string.

Spec 019 R0 acceptance criteria require:
- AC1: `.env`, `decrypted-url.txt`, real-token files **absent from main** and in `.gitignore`
- AC2: `ai-settings.json` shipped with placeholder token, not real value
- AC3: Removed values **scrubbed from git history** and **rotated in any live system**
- AC4: `init` generates a fresh token at install time (this is downstream work, not part of the scrub)

This runbook covers AC1–AC3.

---

## Pre-flight checklist (do these BEFORE running any destructive commands)

- [ ] **Confirm the target repo is `Cowboy-59/wxKanban-agent-Orchestrator`** and you have admin/push rights to it.
- [ ] **Identify all collaborators / forks.** History rewrite breaks every existing clone. Ping any collaborators in advance and confirm they can re-clone after the rewrite.
- [ ] **Take a full backup clone.** `git clone --mirror git@github.com:Cowboy-59/wxKanban-agent-Orchestrator.git orchestrator-backup-2026-04-09.git`. Store this somewhere safe and keep it for at least 30 days. If the rewrite goes wrong, this is your only recovery path.
- [ ] **Determine which credentials are LIVE.** For each value below, confirm with the user whether it is real or throwaway. **Do not assume.** A token that looks fake may still be live; a token that looks real may be a dev artifact.
  - `WXKANBAN_API_TOKEN` value `-cv4lzTWrpwrreu0cTk8X8chcwUPGFPpcECUH7ndQ2c`
  - `DATABASE_URL_ENCRYPTED` value (the long hex string starting `4d5f6d7a33ae4a16...`)
  - The decryption key for `DATABASE_URL_ENCRYPTED` (if it lives anywhere reachable from the public repo, e.g., another file, a `.env` line, a hardcoded constant)
  - Anything in `.env`
  - The contents of `mcp-server/decrypted-url.txt`
- [ ] **For each LIVE credential, schedule its rotation IN PARALLEL with the scrub.** Rotation must complete before or simultaneously with the history rewrite. The rotation order is:
  1. Provision the replacement credential
  2. Update every consumer (production wxKanban server, dev environments, CI)
  3. Verify replacement works
  4. **Then** revoke the leaked one
  5. **Then** scrub history
- [ ] **Choose a scrub tool.** Two options:
  - **`git filter-repo`** (recommended by GitHub) — faster, safer, modern. Requires Python install.
  - **BFG Repo-Cleaner** — older, slightly easier UX, requires Java.
  - This runbook uses `git filter-repo`.
- [ ] **Notify GitHub support** if any of the leaked credentials are GitHub PATs, SSH keys, or webhook secrets — they can purge cached views and forks.

---

## Step 1 — Stop the bleeding (immediate, no history rewrite yet)

**Goal**: Prevent any new commits from re-introducing the secrets, and signal to readers that the values are compromised. Takes 5 minutes.

1. **Clone the repo to a working directory:**
   ```bash
   git clone git@github.com:Cowboy-59/wxKanban-agent-Orchestrator.git
   cd wxKanban-agent-Orchestrator
   ```

2. **Add the offending paths to `.gitignore`:**
   ```bash
   cat >> .gitignore <<'EOF'

   # 2026-04-09 — secrets scrub (spec 019 R0)
   .env
   .env.local
   .env.*.local
   mcp-server/decrypted-url.txt
   mcp-server/decrypted-url-*.txt
   **/decrypted-url.txt
   ai-settings.local.json
   .wxkanban-api-token
   EOF
   ```

3. **Delete the live files from the working tree:**
   ```bash
   git rm .env
   git rm mcp-server/decrypted-url.txt
   ```

4. **Replace the real-looking values in `ai-settings.json` with placeholders:**
   - Open `ai-settings.json`
   - Set `WXKANBAN_API_TOKEN` to `"{{generated_at_init}}"`
   - **Decision needed**: should `DATABASE_URL_ENCRYPTED` also become a placeholder, or stay as the static encrypted value per Spec 019 Decision #3? Per the decision, the encrypted URL is intentionally static across installs, so it can stay — **but only if** the decryption key is provably unreachable from this repo or any sibling artifact. If there is any doubt, also placeholder it as `"{{injected_at_download}}"` and have the kit-download endpoint inject the real encrypted blob server-side.

5. **Commit the surface-level fix:**
   ```bash
   git add .gitignore ai-settings.json
   git commit -m "security: scrub committed secrets, add to .gitignore (spec 019 R0)

   - Remove .env and mcp-server/decrypted-url.txt from tracking
   - Replace WXKANBAN_API_TOKEN sample value with placeholder
   - Add secrets paths to .gitignore

   Note: this commit does NOT remove the values from git history.
   See r0-secrets-scrub-runbook.md Step 3 for the history rewrite."
   git push origin main
   ```

6. **Verify** by browsing the repo on GitHub and confirming `.env` and `decrypted-url.txt` are gone from `main`.

**At this point the secrets are still in git history.** Anyone with the repo URL can still find them via `git log --all -p`. Steps 2 and 3 fix that, but only after rotation (Step 2) is complete.

---

## Step 2 — Rotate every leaked credential

**Goal**: Make the leaked values useless before scrubbing them, so that even if a clone of the pre-scrub history exists in the wild, the values it contains are dead.

**Order matters.** Do not skip steps.

1. **For each credential identified in pre-flight as LIVE:**

   **a. `WXKANBAN_API_TOKEN`** (the per-project API token):
   - This token was generated for a specific `projectid`. Look up that project in the wxKanban DB and find its row.
   - Generate a new token for that project via wxKanban's `ApiTokenService` (or whatever admin endpoint exists for token rotation).
   - Update every consumer: any local `.env`, any deployed instance using this token, any CI secret store.
   - Test the new token end-to-end (make an authenticated MCP call).
   - **Then** mark the old token as revoked in `apitokens` (or whatever the table is). Best done by setting `revokedat = now()` rather than deleting the row, so the audit trail remains.

   **b. `DATABASE_URL_ENCRYPTED` and its decryption key**:
   - **If only the encrypted blob leaked** and the decryption key is provably never committed: technically no rotation is needed, but **you should still rotate the decryption key** as defense in depth.
   - **If the decryption key is reachable from the public repo or its sibling repos**: the encrypted blob is effectively plaintext. Treat the underlying DB connection as fully compromised:
     1. Generate a new DB password for the wxKanban DB user
     2. Update the encrypted blob using the new password
     3. Generate a new decryption key
     4. Re-encrypt the new connection string with the new key
     5. Distribute the new key out-of-band to wherever it needs to live
     6. Restart every wxKanban-aware service that uses the old connection
     7. **Then** rotate the DB password again on the database side to invalidate the old plaintext

   **c. The contents of `mcp-server/decrypted-url.txt`**:
   - This is by definition a plaintext DB URL. If the file ever existed in `main`, the DB credentials it contains must be assumed fully compromised.
   - Follow step **b** above as if the encryption layer never existed. Rotate the DB password, regenerate the encrypted blob, distribute the new key.

   **d. Anything in `.env`**:
   - Inventory each key/value pair. For each:
     - If it's a placeholder or example: no action needed beyond the scrub.
     - If it's a real credential: rotate at the issuing system, update consumers, then scrub.

2. **Verify rotation completeness.** For each rotated credential, confirm:
   - The new value works end-to-end
   - The old value is rejected by the issuing system
   - Every consumer has been updated
   - There is no remaining production reference to the old value

3. **Document the rotation in wxKanban's audit log.** Insert a `companyauditlogs` row (or equivalent) for each rotated credential with timestamp, credential type, reason ("spec 019 R0 secrets scrub"), and rotated-by user. This is the paper trail.

4. **Only proceed to Step 3 once every LIVE credential identified in pre-flight has been rotated and verified.**

---

## Step 3 — Rewrite git history

**Goal**: Remove the leaked values from every commit in the repo's history, so the public repo no longer contains them at any point.

**Warning**: This is destructive and irreversible (the backup mirror from pre-flight is your only undo). Every existing clone of the repo becomes broken — collaborators must re-clone.

1. **Install `git filter-repo`** if you don't have it:
   ```bash
   pip install git-filter-repo
   # or on macOS:
   brew install git-filter-repo
   ```

2. **Make a fresh mirror clone for the rewrite** (do not rewrite the working clone from Step 1):
   ```bash
   cd ..  # leave the working clone
   git clone --mirror git@github.com:Cowboy-59/wxKanban-agent-Orchestrator.git scrub-clone.git
   cd scrub-clone.git
   ```

3. **Build a `replacements.txt` file** listing every literal value to scrub. Each line is `LITERAL_VALUE==>REPLACEMENT`:
   ```
   -cv4lzTWrpwrreu0cTk8X8chcwUPGFPpcECUH7ndQ2c==>***REVOKED-API-TOKEN***
   <actual contents of decrypted-url.txt>==>***REVOKED-DB-URL***
   ```
   Add one line for every literal credential that was rotated in Step 2. Do not include the encrypted DB URL unless the decryption key was also leaked (per the Step 2b decision).

4. **Run the rewrite**:
   ```bash
   git filter-repo --replace-text replacements.txt --force
   git filter-repo --invert-paths --path .env --path mcp-server/decrypted-url.txt --force
   ```
   The first command replaces literal values inline; the second deletes the file paths from every commit they ever appeared in.

5. **Inspect the result locally:**
   ```bash
   git log --all -p | grep -F '-cv4lzTW'   # should return nothing
   git log --all -p | grep -F 'decrypted-url.txt'  # should return nothing
   git log --all --oneline | head -20      # confirm history shape is sane
   ```

6. **Force-push the rewritten history to GitHub**:
   ```bash
   git remote add scrubbed git@github.com:Cowboy-59/wxKanban-agent-Orchestrator.git
   git push scrubbed --force --all
   git push scrubbed --force --tags
   ```
   **This is the irreversible moment.** Once force-pushed, the public history no longer contains the leaked values, and every existing clone is desynced.

7. **Open a GitHub support ticket** to:
   - Purge any cached views of the old commits from the GitHub UI and API
   - Identify and notify owners of any forks (forks retain the old history independently and need their own scrub or deletion)

8. **Notify collaborators** that they must:
   ```bash
   git fetch origin
   git reset --hard origin/main   # destroys local commits — they should stash first
   ```
   Or, more cleanly: re-clone the repo from scratch.

---

## Step 4 — Verification

After Step 3, verify the scrub worked end-to-end.

1. **Fresh clone test:**
   ```bash
   cd /tmp
   git clone git@github.com:Cowboy-59/wxKanban-agent-Orchestrator.git verify-scrub
   cd verify-scrub
   git log --all -p | grep -F '-cv4lzTW' && echo "FAIL: token still in history" || echo "PASS: token absent"
   git log --all -p | grep -F 'decrypted-url' && echo "FAIL: decrypted-url still in history" || echo "PASS: decrypted-url absent"
   find . -name '.env' -not -path './.git/*' && echo "FAIL: .env still tracked" || echo "PASS: .env absent"
   ```

2. **GitHub UI check:** Browse the repo's commit history in the browser. Pick 5 random old commits and confirm none of the leaked values appear in any blob.

3. **Search test:** Use GitHub's code search (`https://github.com/search?q=repo%3ACowboy-59%2FwxKanban-agent-Orchestrator+cv4lzTW`) — should return no matches.

4. **Old-credential rejection test:** Try to use the old `WXKANBAN_API_TOKEN` against the wxKanban API. It must fail with an auth error. (You verified this in Step 2 already, but re-verify after the scrub to be sure nothing was missed.)

5. **Update wxKanban's `apitokens` audit log** with the scrub completion timestamp.

---

## Step 5 — Document the incident

1. **Create an incident note** at `specs/019-agent-orchestrator-kit/incidents/2026-04-09-secrets-scrub.md` (in the wxKanban repo, not the orchestrator repo) capturing:
   - What was found (file paths, value classes — **never** the actual values)
   - When it was found and by whom
   - When rotation completed
   - When the history rewrite completed
   - Who was notified (collaborators, GitHub support)
   - What changed in process to prevent recurrence (see Step 6)

2. **Update [CLAUDE.md](../../CLAUDE.md) or `.claude/rules/`** with a new rule: "No secrets in the orchestrator repo. `ai-settings.json` template values must be placeholders. Pre-commit hook enforces this." (Hook implementation is downstream work, not part of the scrub.)

3. **Update spec 019 R0** to add a status note: "Completed YYYY-MM-DD per `r0-secrets-scrub-runbook.md`."

---

## Step 6 — Prevent recurrence

These are downstream work items, not part of the immediate scrub, but they belong in the same plan so the same incident doesn't happen again.

| Work item | Where it lives |
|---|---|
| Add a pre-commit hook to the orchestrator repo that scans staged files for high-entropy strings (gitleaks, detect-secrets, trufflehog) | `wxKanban-agent-Orchestrator/.git/hooks/` or `.husky/` |
| Add a CI gate on PRs to the orchestrator repo that runs the same scanner | `.github/workflows/secret-scan.yml` |
| Make `init` (Spec 019 R1) the **only** code path that can write a real `WXKANBAN_API_TOKEN` to disk; assert that the value never appears in any committed file | `wxkanban-agent/scripts/init.ts` |
| Add a kit-build-time check that fails the release tarball build if any committed file contains a value matching the token format `^[A-Za-z0-9_-]{40,}$` | release script |
| Add a periodic scheduled scan (weekly?) of the orchestrator repo with `gitleaks --log-opts="--all"` | GitHub Action on `schedule:` |

---

## Deferral Record

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-04-09 | **Deferred** — owner-accepted risk | Owner confirmed `pgkanban.wxperts.com` is the production DB. Plaintext credentials are exposed in the public orchestrator repo via `mcp-server/decrypted-url.txt` and the encrypted-blob-plus-key-in-same-file pattern in `ai-settings.json`. DB password rotation explicitly deferred to a future date. Migration phases A–D may proceed without R0 completion. Resume by saying "run R0". |

---

## What I will NOT do without explicit approval

This runbook is documentation only. I will not execute any of the following without you saying so explicitly:

1. **Touch the orchestrator repo at all** — clone, edit, commit, push, force-push. You own that repo; this runbook is yours to run (or to authorize me to run on your behalf).
2. **Rotate any credential** — rotation is destructive to running services and needs your sign-off.
3. **Force-push to a public repo** — irreversible. Needs explicit "go".
4. **File a GitHub support ticket** on your behalf.

If you want me to execute any of these, tell me which and authorize each one individually.

---

## Status

- **Date**: 2026-04-09
- **Phase**: documentation only
- **Blocked on**: confirmation of which leaked credentials are LIVE vs throwaway, plus authorization to execute (or you running it yourself)
- **Estimated effort if all credentials are throwaway**: ~30 minutes (Steps 1, 3, 4 only — no rotation needed)
- **Estimated effort if some credentials are live**: half a day to a day (rotation is the slow part, especially if multiple consumers need updating)
