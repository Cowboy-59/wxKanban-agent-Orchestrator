# WXK Lockdown Runbook: Proactive By DDES

**Version 1.0 · 24 October 2026 · from Chris White, for Andrew's Claude Code session**

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
- **Fixed Claude Code rules** in the dev environments: block scope deletes and spec status changes, and only allow writing a scope to wxKanban once it is on `dev`.
- **PR checks:** amendment record required when a scope file changes; scope number must not already exist in wxKanban; nightly drift check between wxKanban and `dev`.
