# WXK Lockdown Runbook: Proactive By DDES

**Version 1.1 · 24 October 2026 · from Chris White, for Andrew's Claude Code session**
*1.1 adds Step 4: fixed Claude Code rules in the dev environments.*

> **Andrew, how to use this file:** save it in the root of the Proactive repo, open Claude Code there and say:
> *"Read WXK_Lockdown_Runbook.md and walk me through it, one step at a time."*
> Claude will guide you, run the safe checks, and stop whenever you need to click something or approve something.

---

## Instructions for Claude

You are helping Andrew set up the Proactive By DDES workflow so the right way of working is enforced by the tools, not by memory. Work through the steps below **in order, one at a time**. At the end of each step, confirm with Andrew that the "How to tell it worked" check passed before moving on.

### Hard rules for this session

1. **Never run `dbpush` or any `wxkanban-agent` command to "see its help".** `dbpush --help` has previously ignored the flag and run a real push. Read the source instead.
2. **Never ask Andrew to paste a token into this chat.** Tokens go into his terminal (hidden input), a GitHub secret box, or a Codespaces secret. Never into chat, files, or commits.
3. **Make no writes to wxKanban during this runbook**, apart from read-only checks such as listing tokens. No `create_specs`, `upsert_document`, `delete_scope`, status changes or pushes.
4. **Never push to `dev` or `main` directly.** Work on a new branch and open a PR. Do not merge any PR. Andrew merges.
5. **GitHub settings pages are Andrew's to click.** Describe exactly what to set, and wait for him to confirm.
6. **If anything is unclear or unexpected, stop and ask Andrew.** Don't improvise a workaround.

### Background (one paragraph)

wxKanban only receives what is pushed to it. Nothing pulls back down, the last push wins, and edits overwrite. So laptops, GitHub and wxKanban drift apart however carefully people work. The fix: **GitHub `dev` is the master copy**, wxKanban is updated **only from merged `dev`**, and each person edits in **their own dev environment on their own branch**. The full picture is in Chris's page "WXK Workflow [DDES]".

---

## Step 0 · Andrew's own wxKanban connection

**Goal:** Andrew has his own wxKanban token, stored in his personal Claude settings, never in the repo.

**Facts:**
- wxKanban MCP server: `https://mcp.wxperts.com/mcp` (HTTP)
- Auth header: `Authorization: Bearer <token>`

**Andrew does:**
1. wxKanban web app → open the project → **Kit** tab → **Download Kit**. Copy the token shown (it is shown once). He doesn't need to unzip the new kit.
2. In a terminal **in the project folder**, run this, paste the token (it won't show) and press Enter:
   ```bash
   read -s WXK_TOKEN
   ```
3. Then:
   ```bash
   claude mcp add --transport http wxkanban https://mcp.wxperts.com/mcp --header "Authorization: Bearer $WXK_TOKEN"
   ```
   This saves the connection for this project only, in his personal settings. It overrides any copy the kit wrote into the project.
4. Restart Claude Code, and the Code tab in the Claude app.

**Claude does (read-only):**
- Run `claude mcp list` and confirm `wxkanban` is connected.
- Run `git ls-files .mcp.json .claude/settings.local.json`. If either file is tracked, check whether it contains a token. **If a token was ever committed, tell Andrew: that token must be revoked and the file removed from git.** Then add both files to `.gitignore` on a branch.
- List the project's wxKanban API tokens (read-only) and show Andrew which ones exist, so old or unknown ones can be revoked.

**How to tell it worked:** `wxkanban` shows connected, and no token is tracked in git.

---

## Step 1 · Protect `dev` and `main`

**Goal:** nobody (Andrew, Chris, the other developer or Claude) can change `dev` or `main` directly. Everything goes through a PR that passes CI.

**Claude does first (read-only):**
- Check `.github/workflows/` and any deploy scripts for anything that pushes **directly** to `dev` or `main`. If something does, tell Andrew before the ruleset goes on, because it will start failing.
- Run `gh api repos/{owner}/{repo}` and report the owner and whether the repo is private. Remind Andrew that **on a free GitHub plan, rulesets on a private repo save but are not enforced.** The owner needs a paid plan.

**Andrew does:** GitHub repo → **Settings → Rules → Rulesets → New ruleset → New branch ruleset**

| Setting | Value |
|---|---|
| Name | `Protect dev and main` |
| Enforcement status | **Active** |
| Bypass list | **Leave empty** (so the rule applies to admins too) |
| Target branches | Add target → Include by pattern → `dev`, and `main` |
| Restrict deletions | ✅ |
| Block force pushes | ✅ |
| Require a pull request before merging | ✅. **Required approvals: 0 for now**, so Andrew can merge his own PRs. Raise to 1 once there is always a reviewer. |
| Require status checks to pass | ✅. Add the existing **CI coverage** job, plus DeepSource if it's listed. |

**How to tell it worked:** Claude creates a throwaway commit on a local copy of `dev` and tries `git push origin dev`. GitHub must **refuse** it. Then Claude removes the throwaway commit locally (`git reset --hard origin/dev`, only after confirming with Andrew that nothing else is uncommitted).

---

## Step 2 · One automated writer to wxKanban

**Goal:** after each merge to `dev`, GitHub Actions updates wxKanban automatically. Later, this becomes the *only* thing allowed to write to wxKanban.

**Andrew does:**
1. Kit tab → **Download Kit** again and copy the new token. This one is just for CI.
2. GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**. Name: `WXKANBAN_API_TOKEN`. Paste the token there and nowhere else.

**Claude does: read-only investigation first. Do not run `dbpush`, not even with `--help`.**
1. Read the source of the `wxkanban-agent dbpush` command and report:
   - every flag it accepts, especially any dry-run option;
   - where it reads the API token and project ID from (env var name, file);
   - which repo and folder the `specs/` it pushes live in;
   - what it needs installed (Node version, `npm install`, etc.).
2. On a new branch, draft `.github/workflows/wxkanban-sync.yml` that:
   - runs on push to `dev`, and manually (`workflow_dispatch`);
   - sets up Node 20 and installs only what `dbpush` needs;
   - reads the token from `secrets.WXKANBAN_API_TOKEN`;
   - runs `dbpush` in **dry-run mode only**, printing its output.
3. Open a PR. **Do not merge.**

**How to tell it worked:** Andrew runs the workflow manually from the Actions tab. The log shows what *would* be pushed, and nothing changes in wxKanban. **Andrew and Chris read that output together before anyone switches it to a real push.** Watch for documents that would be duplicated because their titles differ.

---

## Step 3 · Andrew's own dev environment (trial week)

**Goal:** Andrew edits in his own environment on a server, on his own branch, sees the app change as he types, and his work saves itself. The laptop becomes a read-only copy once he trusts this, not before.

**Recommended setup:** GitHub Codespaces, so there's no server to build or maintain. Chris may later move this to a dedicated VM.

**Database rule:** a disposable Postgres inside the environment, loaded with **test/seed data only**. No production data, and no production connection strings.

**Claude does: on a new branch, change no app code:**
1. `.devcontainer/devcontainer.json`:
   - Node 20, git, GitHub CLI, Claude Code;
   - local Postgres via docker-compose, seeded from the project's seed/test data only;
   - forward the web app's dev-server port so the preview opens in a browser tab;
   - recommend the VS Code extensions the project already uses.
2. An autosave script that starts with the codespace: every 10 minutes, if there are changes, commit as `wip: autosave` and push to the current branch. **It must refuse to run on `dev` or `main`.**
3. Configure the `wxkanban` MCP inside the codespace to read its token from a Codespaces secret named `WXKANBAN_API_TOKEN`, so no token is ever written into the repo.
4. A short README section: how to open your codespace, where the preview appears, how autosave works.
5. Open a PR. **Do not merge.**

**Andrew does, after the PR is merged:**
1. GitHub → his **profile Settings → Codespaces → New secret**. Name: `WXKANBAN_API_TOKEN`, value: his personal token from Step 0, access limited to this repo.
2. Repo → **Code → Codespaces → Create codespace**, then create his own branch inside it, e.g. `andrew/env`.
3. Work there **alongside** the laptop for a week.

**How to tell it worked:**
- An edit shows up in the preview tab.
- Within 10 minutes, a `wip: autosave` commit appears on Andrew's branch in GitHub.
- `/buildscope` inside the codespace can reach wxKanban.

Codespaces is billed to the account that owns the repo, so check its monthly allowance.

---

## Step 4 · Fixed Claude Code rules in the dev environments

**Goal:** Claude follows the wxKanban process because it *can't* do otherwise, whatever it remembers or forgets. The rules live in Claude Code's **managed settings**, which sit above user, project and local settings, so nothing in those files can override them.

**Where the rules live:**
- The source file goes in the repo at `.devcontainer/claude/managed-settings.json`, alongside a guard script.
- The dev environment installs them at build time to `/etc/claude-code/managed-settings.json` (the Linux location Claude Code reads).
- Because `dev` is protected (Step 1), **changing the rules takes a reviewed PR.** That's the real lock.

**Honest limit:** inside a Codespace the user has admin (sudo) rights, so someone determined could still edit the installed file. That makes the rules tamper-evident, not tamper-proof. On a dedicated VM where developers don't have root, they're fully locked. For a trial week, tamper-evident is enough.

### What the rules do

| Rule | How it's enforced |
|---|---|
| No auto mode | `"disableAutoMode": "disable"`. Sessions start in normal mode, where each write is approved. |
| No skipping permissions | `"permissions": { "disableBypassPermissionsMode": "disable" }` |
| Only these rules count | `"allowManagedPermissionRulesOnly": true` and `"allowManagedHooksOnly": true`. User, project and local permission rules and hooks are ignored. |
| Never delete scopes or tasks, change spec statuses, or touch tokens and kits | Deny rules for `mcp__wxkanban__project_delete_scope`, `mcp__wxkanban__project_delete_task`, `mcp__wxkanban__project_update_spec_status`, `mcp__wxkanban__project_create_api_token`, `mcp__wxkanban__project_revoke_api_token`, `mcp__wxkanban__project_regenerate_kit` and `mcp__wxkanban__project_download_kit`. These are human jobs, done in the web app. |
| Only write a scope to wxKanban once it's on dev | A PreToolUse hook guards the wxKanban tools that write scope and spec content (`create_specs`, `buildscope`, `upsert_document`, `upsert_test_plan`). It blocks them unless the `specs/` folder has no uncommitted changes and matches `origin/dev` exactly. |
| `dbpush` only as a dry run | The same hook, matched on Bash, blocks any command containing `dbpush` unless it has the dry-run flag found in Step 2. It also blocks any `wxkanban-agent` command run with `--help`. |

**Do not deny `project_sign_off_test`.** `/wxCreateTestPlan --Execute` uses it to sign off *machine* tests in QA, and blocking it would hold every scope in QA. Human tests are signed off in the web app, never by Claude.

### Claude does: on a new branch

1. **Investigate first (read-only).** Read the `/buildscope` and `/createSpecs` command prompts (via `get_command_prompt`) and list which wxKanban tools each calls, and in what order. **If the "only once on dev" guard would block the normal flow for a brand-new scope** (for example, if the server must assign the scope number before a file can exist), stop and report the options to Andrew. Do not weaken the guard on your own.
2. **Write `.devcontainer/claude/managed-settings.json`** with:
   - `"disableAutoMode": "disable"`, `"allowManagedPermissionRulesOnly": true`, `"allowManagedHooksOnly": true`
   - `"permissions"`: `"defaultMode": "default"`, `"disableBypassPermissionsMode": "disable"`, the `deny` list from the table above, and a **short `allow` list of read-only, everyday commands** (for example `git status`, `git diff`, `git log`, running tests). Without one, every command prompts, because user allow rules no longer count.
   - `"hooks"`: one PreToolUse entry with matcher `mcp__wxkanban__project_(create_specs|buildscope|upsert_document|upsert_test_plan)` and one with matcher `Bash`, both pointing at the guard script by absolute path.
3. **Write `.devcontainer/claude/wxk-guard.sh`** that reads the hook JSON from stdin (`tool_name`, `tool_input`, `cwd`) and:
   - for the wxKanban write tools: runs `git fetch origin dev` and checks that `git status --porcelain -- specs/` is empty and `git diff --quiet origin/dev -- specs/` passes. If not, it **blocks** with the reason "Scope and spec changes must be merged to dev before they are written to wxKanban."
   - for Bash: blocks `dbpush` without the dry-run flag, and `wxkanban-agent … --help`.
   - blocks by printing `{"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "deny", "permissionDecisionReason": "<reason>"}}` and exiting 0, and allows everything else silently.
   - **fails closed:** if `git fetch` fails or the JSON can't be read, it blocks the wxKanban write tools, with a reason.
4. **Install step:** add to the devcontainer's setup so that, on build, it copies both files to `/etc/claude-code/` (owned by root, script executable) and points the hook path there.
5. **Tests without touching wxKanban.** Add `.devcontainer/claude/test-guard.sh`, which pipes sample hook JSON into the guard and checks each decision:
   - `create_specs` with a dirty `specs/` → deny;
   - `create_specs` with `specs/` matching `origin/dev` → allow;
   - `dbpush` → deny, `dbpush` with the dry-run flag → allow, `wxkanban-agent dbpush --help` → deny;
   - an unrelated Bash command → allow.
6. Open a PR. **Do not merge.**

**Never test the deny rules by calling the real tools.** If a rule were misconfigured, the call would really run. Use the test script and the checks below.

### How to tell it worked (in a rebuilt Codespace)

- `test-guard.sh` passes every case.
- `/permissions` lists the deny rules, with managed settings shown as their source.
- Shift+Tab no longer offers auto mode.
- With a scope file edited but not committed, asking Claude to "run /createSpecs for that scope" is **refused by the guard** before anything reaches wxKanban. Claude should show the guard's reason.

---

## Until all this is in place: habits for today

- Commit and push every file you touched to a branch the same day.
- One named person writes to wxKanban. No `dbpush`, and no re-running `/createSpecs` on an existing scope, without a dry run first.
- Pull `dev` before you start.
- Never create or edit scopes in the wxKanban web app.
- Check out a scope in the Dev Cockpit before changing it.
- Before amending a scope, copy the current version into its amendments record with the date and the reason.
- Turn Claude Code's auto mode off for wxKanban work, and approve each write.
- One goal per Claude prompt, naming the slash command.

---

## After this runbook (not today)

- **Revoke the wxKanban tokens on laptops**, once Steps 2 and 3 are working. Tokens then live only in CI and the dev environments.
- **Move the dev environments to a VM where developers don't have root**, if the trial works, so the Step 4 rules become fully locked.
- **PR checks:** amendment record required when a scope file changes; scope number must not already exist in wxKanban; nightly drift check between wxKanban and `dev`.
