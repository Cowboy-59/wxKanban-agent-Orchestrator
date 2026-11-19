# Quickstart: Kit Upgrade File Preservation

**Spec**: 121 · **Spec ID**: `dde4a6e7-19c0-4253-a174-268324927b7c`

## Before you write a line of code

You are editing **the other repository**.

```bash
# THE SHIPPED SCRIPT — this is the one to change
E:\AI_Development\wxperts\wxKanban-agent-Orchestrator\scripts\upgrade-kit.mjs

# NOT this one. Editing it changes nothing for any consumer.
E:\AI_Development\wxperts\wxKanban\scripts\upgrade-kit.mjs
```

Same filename, different lineage, **opposite delete semantics**. The author-side copy in this repo
`rmSync`s whole directories; the shipped one extracts over the project root and never deletes except
for a hardcoded rename list. Confirm which one you have open before starting:

```bash
grep -n "overlays the archive" scripts/upgrade-kit.mjs   # present ⇒ shipped copy, correct
grep -n "KIT_DIRS" scripts/upgrade-kit.mjs               # present ⇒ author-side copy, WRONG FILE
```

## See the defect yourself (5 minutes)

```bash
# In a throwaway kit consumer project:
echo "# my repair" >> .claude/wxConversion/scripts/pcsoft-doc-split.py
node -e "const p=require('./package.json');p.scripts.mine='echo hi';require('fs').writeFileSync('package.json',JSON.stringify(p,null,2))"
md5sum .claude/wxConversion/scripts/pcsoft-doc-split.py package.json > /tmp/before.md5

node scripts/upgrade-kit.mjs

md5sum -c /tmp/before.md5     # both fail
echo $?                       # the upgrade exited 0 and said nothing
```

That silence is the bug. Not the overwrite — the *silence*.

## Orientation in the shipped script

| Function | What it does | Task |
|---|---|---|
| `downloadFromWxKanban()` | normal path — **no overwrite gate** | T009 |
| `downloadFromGitHub()` | fallback — gates on `--confirm-overwrite`, names 4 files | T009 |
| `extractArchive()` | `Expand-Archive -Force` (win) / `tar -xzf` (else), over `root` | T004 |
| `cleanupStaleAfterExtract()` | unconditional deletes from a hardcoded rename list | T008 |
| `cleanupLegacyMcpIfNeeded()` | pre-v1.1.0 cutover; leave alone | — |
| `updateProjectConfigVersion()` | stamps `.wxkanban-project.json` | — |
| `runInit()` | re-runs `init.mjs` | T001 |

## Start here

**T003 (snapshot) is the best first task.** It is independent of everything else, needs no
classification logic, and on its own converts silent data loss into recoverable loss. If the rest of
the spec slips, T003 alone is worth shipping.

Then **T001 → T002**. Nothing else is implementable without the provenance record and the comparator.

```bash
cd E:/AI_Development/wxperts/wxKanban-agent-Orchestrator
npx vitest run scripts/__tests__/upgrade-kit    # once T012 lands
```

## The one thing that will trip you up

**Both extraction branches.** Windows takes PowerShell `Expand-Archive -Force`; everything else takes
`tar -xzf`. A fix applied to one is a platform-dependent data-loss bug — and every field report so far
came from Windows Server 2022. If you develop on WSL or macOS you will not hit the branch that
actually broke five customers.

## Sanity checks

```bash
# .wxai must never be inside the archive, or the manifest self-destructs
tar -tzf kit.tar.gz | grep -c "^\.wxai/"        # must be 0

# the kit must not gain a runtime dependency
node -e "console.log(Object.keys(require('./package.json').dependencies||{}))"
```

## Definition of done

Not "tests pass". Done is: on a **real consumer project**, after a real
`sync-to-orchestrator --release`, a deliberately modified kit file survives an upgrade with a
`.kit-new` beside it, `package.json` keeps its own scripts and dependencies, and the run tells you
exactly what it changed. See T013.

## T011 lives in the other-other repo

T011 is **wxKanban server work** — `GET /api/projects/:id/kit/upgrade` in this repo, not the kit. It
protects the upgrade that *delivers* this fix, which is otherwise the one upgrade nothing can guard,
since consumers run their own on-disk copy of the script.

It works because the pre-fix client already does three things we can exploit without changing it:

```js
// scripts/upgrade-kit.mjs, shipped copy — all three already present
params = new URLSearchParams({ platform: platform(), fromVersion: currentVersion });  // :242
throw new Error(`HTTP ${response.status} from wxKanban: ${text.slice(0, 300)}`);      // :258
if (/HTTP 4\d\d/.test(err.message)) die(err.message);   // :418 — no GitHub fallback
```

So: return **409** with a sub-300-character body, and the consumer's own unmodified script prints your
instruction and stops without writing anything. Mind the `.slice(0, 300)` — verify against the real
truncation, it is the entire channel.

**Deploy the gate before shipping the kit.** Reversed, the fastest upgraders get nothing.

