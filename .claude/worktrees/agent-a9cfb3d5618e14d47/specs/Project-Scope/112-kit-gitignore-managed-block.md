# SCOPE-112 — Kit Gitignore Managed Block

Status: Draft (scope approved in conversation 2026-07-27; not yet in DB)
Owner: Andy (wxperts)
Related: SCOPE-019 (Orchestrator Kit), SCOPE-027 (Kit Runtime Hygiene), SCOPE-028 (Hosted MCP), SCOPE-095 (Kit Connect Bootstrap)

## Overview

A wxKanban kit install writes a large, machine-regenerable tree into the consumer's
repository root — `wxkanban-agent/`, `_wxAI/`, `shared/`, `bin/`, 10 files under
`scripts/`, 2 under `.vscode/`, and 87 under `.claude/` — plus per-developer runtime
and secret-bearing files (`.wxai/`, `.mcp.json`, `.env`, `ai-settings.json`). None of
it is the consumer's work product; all of it is re-downloadable from the kit release.

Today the consumer is expected to hand-paste a 12-line snippet
(`wxkanban-agent/templates/.gitignore.snippet`) that covers only the secret and
runtime files. The rest — over a hundred kit-authored files — lands in the
consumer's git history, churns on every kit upgrade, and pollutes every diff and
code review in the project.

This scope makes the kit declare what it owns at build time and ignore it at
install time: `build-release.mjs` emits a manifest of every packed path,
`scripts/init.mjs` collapses that manifest into a delimited, idempotent block
appended to the consumer's existing `.gitignore`, and — with explicit consent —
untracks kit files that a pre-existing project already committed.

It also closes a live defect found while scoping this work: the per-project kit
download currently ships a one-line `.gitignore` inside the archive, and the
Cockpit bootstrap extracts that archive over the workspace root, silently
overwriting the consumer's existing `.gitignore`.

## Business Problem

Consumers evaluating wxKanban see the kit as invasive: a single `Install Kit`
action adds 100+ files to their repository that they did not write, cannot
meaningfully review, and must re-review on every kit upgrade. For a product whose
target customer is a career-changer adopting a new methodology, that first-run
impression is a direct adoption barrier — the tool looks like it is taking over
the repo rather than assisting in it.

The mitigation that exists today is a manual copy-paste step buried in a template
file. It is incomplete (covers 12 entries, not the full surface), it is never
enforced, and it drifts: the kit's shipped file list changes every release while
the snippet does not.

Separately, the `.gitignore` clobber defect means a consumer bootstrapping the kit
into an existing project can lose their entire `.gitignore` with no warning and no
prompt — a silent, committed data loss that looks like the user's own mistake.

## Actors

Primary: Consumer developer installing or upgrading the wxKanban kit into their own project repository, via the Cockpit "Install Kit" command or `node scripts/init.mjs`.
Secondary: wxKanban kit release engineer running `scripts/build-release.mjs`, whose pack-time allowlist becomes the authoritative ignore inventory; and the consumer's teammates, who inherit the committed `.gitignore` block.

## Success Metrics

- A fresh kit install into a git repository leaves 0 kit-authored files tracked by git (measured as `git ls-files` ∩ the computed ignore-set = empty), down from 100+ today. The ignore-set, not the raw manifest, is the yardstick: `package.json` and `package-lock.json` are in the manifest but deliberately stay tracked.
- A consumer's pre-existing `.gitignore` survives kit install and upgrade with 100% of its original bytes intact, verified by byte comparison in an automated test.
- The ignore inventory drifts by 0 entries per kit release, because it is derived from the pack-time manifest rather than hand-maintained.
- Kit install adds no more than 1 additional interactive prompt, and only when previously tracked kit files are detected.
- Kit install success rate is unaffected: a `.gitignore` read or write failure degrades to a warning in 100% of cases and never fails the install.

## Scope Boundary

In scope:

1. Manifest emission at kit creation. `scripts/build-release.mjs` (orchestrator
   repo) writes `wxkanban-agent/templates/kit-manifest.json` listing every path it
   packs, derived from the same `files` array it already computes for
   `KIT_INCLUDE_DIRS` / `KIT_INCLUDE_FILES`.

2. A shared writer, `ensureKitGitignore(root, opts)`, in `scripts/init.mjs`, called
   from bootstrap (`init.mjs`), upgrade (`scripts/upgrade-kit.mjs`), and the
   Cockpit "Install Kit" command (which already shells to `node scripts/init.mjs`).

3. Manifest-to-ignore-set collapse:
   - Whole-directory entries where the kit owns the entire directory:
     `wxkanban-agent/`, `_wxAI/`, `bin/`, `shared/`.
   - Per-file entries inside shared namespaces the consumer also owns
     (`scripts/`, `.vscode/`, `.claude/`): one entry per manifest path under
     those roots, never a directory sweep. As of v1.7.9 that is 10 `scripts/*`
     files, `.vscode/tasks.json` and `.vscode/settings.json`, and 87 files under
     `.claude/` — but the counts are derived, not fixed.
   - A fixed tail for paths not in the manifest because they are generated at
     install time or by `KitGenerationService`: `.wxai/`, `.mcp.json`, `.env`,
     `ai-settings.json`, `.wxkanban-project.json`, `mcp-server/`,
     `.husky/pre-commit`, `.husky/post-checkout`, `.husky/post-merge`,
     `AI.md`, `ProjectOverview.md`.

4. A delimited managed block appended to the consumer's `.gitignore`:

   ```gitignore
   # >>> wxKanban kit (managed — regenerated on install/upgrade) >>>
   # Everything below is kit-authored and re-downloadable. Delete this whole
   # block (or run `node scripts/init.mjs --no-gitignore`) to opt out.
   ...entries...
   # <<< wxKanban kit (managed) <<<
   ```

   The writer touches only the text between the markers. On upgrade the block is
   replaced in place so inventory changes propagate. Everything the consumer wrote
   outside the markers is preserved byte-for-byte.

5. Line-ending fidelity. The writer detects the file's dominant line ending and
   matches it. A newly created file uses LF. This replaces the hardcoded `\n` in
   `KitProxyService.ensureGitignored`, which mixes endings into a CRLF file and
   produces a whole-file diff on the consumer's next commit.

6. Opt-out via tombstone. `node scripts/init.mjs --no-gitignore` writes a single
   line `# wxKanban kit gitignore: opted out` instead of the block. The writer is
   a no-op if it finds either the begin marker or the tombstone, so opting out
   survives every subsequent upgrade.

7. Untracking already-committed kit files, with explicit consent. After writing
   the block, compute `git ls-files --cached` ∩ ignore-set. When non-empty, print
   one line of context, the count, and the first 20 paths, then prompt
   `Untrack these N files? They stay on disk; only git stops tracking them. [y/N]`
   defaulting to No. On `y`, run `git rm -r --cached --quiet --` in batches and
   report `Staged N deletions — review with 'git status' and commit when ready.`
   The kit never commits.

8. Refusals that make step 7 safe. Skip untracking, print the equivalent
   `git rm -r --cached …` command, and continue when: stdin is not a TTY (CI,
   `--yes`, piped input); the git index already has staged changes; or the repo is
   in detached HEAD, mid-rebase, or mid-merge.

9. Self-exclusion guard. The writer refuses to run in the kit's own source repos,
   where these files are the product. Detection matches
   `git remote get-url origin` against `wxKanban(\.git)?$` and
   `wxKanban-agent-Orchestrator(\.git)?$`, reusing the technique already proven in
   `scripts/sync-to-orchestrator.mjs`. A `.wxai/kit-source-repo` marker file is
   honored as a manual override for forks. Note that the presence of
   `scripts/build-release.mjs` is NOT a valid detector — that file ships into
   consumer projects.

10. Defect fix: stop shipping `.gitignore` inside the per-project archive.
    `KitProxyService.injectProjectFiles` currently calls `ensureGitignored(destDir,
    '.mcp.json')` on the extracted archive before repacking, so every download
    contains a one-line `.gitignore`. The Cockpit bootstrap then extracts that over
    the workspace root, overwriting the consumer's file. Remove that call; `.mcp.json`
    moves into the managed block written by `init.mjs`.

11. Documentation. `wxkanban-agent/templates/.gitignore.snippet` shrinks to a
    pointer explaining the block is now written automatically (the file is retained
    so existing references do not break). `wxkanban-agent/docs/kit-runtime.md`
    gains a section covering the block, the tombstone, and the untrack step.

12. Default is ON. Every new install and every upgrade writes the block unless
    opted out.

## Out of Scope

- No database column, no API field, and no migration. The behavior carries no
  persisted per-project state.
- No change to the KitManager UI (`src/client/components/KitManagement/KitManager.tsx`).
  There is no checkbox at kit creation; opt-out is entirely consumer-side.
- `specs/` and `specs/Project-Scope/` remain tracked. They are the consumer's work
  product, not kit machinery.
- `package.json`, `package-lock.json`, `CLAUDE.md` and `README.md` are never
  ignored, despite being kit-authored on a greenfield install. Ignoring the
  manifests would break any consumer project outright; `CLAUDE.md` carries the
  SPEC-FIRST gate and project rules and must stay under review.
- No `.git/info/exclude` variant. The block is committed and therefore team-wide,
  which is the intended semantics.
- No retroactive remediation for projects that already committed kit files and
  never upgrade the kit.
- The kit never runs `git commit`. Untracking stages deletions only.

## Data Requirements

No schema changes. One new build artifact:

`wxkanban-agent/templates/kit-manifest.json` — emitted by `build-release.mjs`,
shipped inside the archive, read by `init.mjs`:

```json
{
  "kitVersion": "1.7.40",
  "generatedAt": "2026-07-27T00:00:00.000Z",
  "paths": ["wxkanban-agent/core/...", ".claude/commands/implement.md", "..."]
}
```

`paths` is the exact packed file list, POSIX separators, repo-root-relative.

## API Routes

None. No new or changed HTTP endpoints. One behavioral change to an existing
route's payload: `GET /api/projects/:id/kit/download` stops including a
`.gitignore` in the archive it serves (scope item 10).

## Frontend Components

None. The Cockpit "Install Kit" command already shells to `node scripts/init.mjs`
and inherits the behavior without change.

## Testing

Vitest, against a temp directory with `git init`:

- No `.gitignore` present: created, block only, LF endings.
- Existing CRLF `.gitignore` with consumer entries: consumer bytes identical, block
  appended, CRLF throughout.
- File with no trailing newline: separator inserted, no glued line.
- Block already present, inventory changed: block replaced, text outside markers
  untouched.
- Tombstone present: nothing written, clean exit.
- `--no-gitignore`: tombstone written, no block.
- Origin is `.../wxKanban.git`: self-exclusion guard fires, file untouched.
- Manifest collapse: whole-directory entries for owned dirs, per-file entries for
  `scripts/`, `.vscode/`, `.claude/`, and an explicit assertion that `package.json`
  is absent from the ignore set.
- Tracked-set intersection against a repo with `_wxAI/` committed: correct paths
  computed, and with a non-TTY stdin no `git rm` is issued.
- Integration: bootstrap into a temp repo holding a pre-existing `.gitignore`;
  assert it is preserved and the block is appended.

## Rollout

Default-ON means the first upgrade on an existing consumer project finds a large
tracked set — plausibly 100+ files — and fires the prompt. That is intended, so
the prompt leads with one line of context ("This kit version gitignores
kit-authored files; N are currently tracked") rather than a bare y/N. The default
answer is No, so taking no action is always safe.

Ships as a kit release. Requires coordinated changes in both repos: the manifest
emitter in `wxKanban-agent-Orchestrator/scripts/build-release.mjs` (orchestrator-
owned, not mirrored), and the writer plus tests in this repo.

## Open Questions

1. Should `.claude/settings.json` and `.claude/settings.local.json` be added to the
   fixed tail? They are excluded from the pack by `EXCLUDE_CLAUDE_TOPLEVEL` in
   `build-release.mjs` and hold per-machine state, so they are arguably a consumer
   concern rather than kit-authored — but a consumer who commits
   `settings.local.json` leaks per-machine paths.
2. `KitGenerationService` writes a partly different file set than the release
   archive (`AI.md`, `mcp-server/`, `.husky/*`, `ai-settings.json`). The fixed tail
   covers these by hand. Should that path also emit a manifest, so both generation
   routes are manifest-driven and the fixed tail can shrink?
3. Does any consumer today rely on `wxkanban-agent/` being committed — for example,
   a CI job that checks out the repo and runs `wxkanban-agent auditfences` without
   a kit install step? If so, the block needs a documented `--no-gitignore` note in
   the CI setup docs.
