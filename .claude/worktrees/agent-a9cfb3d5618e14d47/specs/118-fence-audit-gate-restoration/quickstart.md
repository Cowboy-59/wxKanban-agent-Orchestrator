# Quickstart: Spec 118 — Fence Audit Gate Restoration

## The situation in one line

The fence gate has been red since at least 2026-07-29, so it enforces nothing — and nearly half its
errors come from code that isn't ours.

## Reproduce the baseline

```bash
npx tsx -e "
import * as h from './wxkanban-agent/core/orchestrator/command-handlers/auditfences.js';
const fn = h.handleAuditFencesCommand ?? h.default?.handleAuditFencesCommand;
const r = await fn({ path:'.', specsRoot:'specs', legacyFile:'.wxai/auditfences-legacy.json', strict:true, format:'json' });
const d = JSON.parse(r.output);
console.log(d.summary);
"
```

Expected today: `{ files: 4074, fences: 839, errors: 1893, warnings: 0, info: 6161 }`

## Where the errors come from

| Bucket | Errors |
| --- | --- |
| `.agents/` + `.claude/` + `.history/` — **gitignored, not our code** | **885** |
| `src/server/` | 384 |
| `src/client/` | 201 |
| `mcp-server/` | 123 |
| `wxkanban-agent/` | 88 |
| `scripts/` | 78 |
| everything else | ~134 |

By code: `UNFENCED_DECL` 1,679 · `UNKNOWN_TASK` 213 · `UNKNOWN_MODIFIER_TASK` 1

## Key files

| Concern | Path |
| --- | --- |
| Scanner (walks the FS) | `wxkanban-agent/core/orchestrator/auditfences-scanner.ts` |
| `DEFAULT_IGNORE` set | same file, ~line 46 |
| Command handler | `wxkanban-agent/core/orchestrator/command-handlers/auditfences.ts` |
| Legacy baseline (2,759 entries) | `.wxai/auditfences-legacy.json` |
| CI workflow | `.github/workflows/auditfences.yml` |
| Fencing convention | `specs/026-CodeFencing/spec.md`, `wxkanban-agent/docs/fencing.md` |

## Gotchas

- **The scanner walks the filesystem, not git.** `.agents/`, `.claude/skills/` and `.history/` are
  all in `.gitignore` already (lines 141, 142, 78) and zero `.history` files are tracked. This is
  the second defect of this class here — kit sync shipped untracked files under ignored paths to a
  public release.
- **`DEFAULT_IGNORE` already has `.claude/skills`** (SCOPE 081 / T004). The pattern exists; it was
  never extended.
- **Quieter is the dangerous direction.** A gate that goes silent reads as "clean". T002 exists
  solely to catch that.
- **The scanner is kit code.** It ships to every consumer project; changes propagate silently.
- **Baselining is debt, not a fix.** ~795 real violations get suppressed. Without a dated,
  queryable record it becomes amnesia.

## Order of work

Follow `tasks.md`. T002 gates T001 (prove nothing left scope), and T005 gates trusting the gate
green (prove it can still fail).
