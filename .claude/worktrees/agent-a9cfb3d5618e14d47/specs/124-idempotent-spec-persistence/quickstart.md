# Quickstart: Idempotent Spec Persistence

## Before you write a line of code

**T001 is already done and deployed** (commit `316ffef4`). Read it first so you do not redo it:

```bash
git show 316ffef4 -- mcp-server/src/utils/project-kit.ts
```

Then read the two places identity is still inferred:

```
wxkanban-agent/dbpush.ts                 # lines 473-512 and 774 — identity from task titles
mcp-server/src/utils/project-kit.ts      # buildScope — edit rebuilds from arguments, reads nothing
```

## See the defect yourself (5 minutes)

**The identity branch that never fires.** `dbpush` takes `t.specNumber ?? parseScopeFromTaskTitle(t.title)`,
but tasks carry `specId`, a UUID — there is no `specNumber` on a task:

```bash
grep -n "specId\|specNumber" mcp-server/src/db/schema.ts | head
```

So every lookup falls to the title regex. The code admits it at `dbpush.ts:482`:

```bash
sed -n '480,490p' wxkanban-agent/dbpush.ts
```

**The envelope cannot answer the question.** `project.list_open_items` returns `tasks`, `documents`,
`events` — no `specs[]`. That absence is the root cause of the inference, which is why FR-004 comes
before FR-003.

**The preflight rejects ordinary Spanish.** One line, from `shared/preflight`:

```bash
cd shared/preflight && node -e "console.log(require('./dist/index.js').matchesPlaceholder('the todo list'))"
```

It returns a marker hit for an ordinary English sentence — and for any Spanish sentence using that
word. That is report `c9fc52d4`.

## Three traps

**`normalizeText` strips backticks before matching.** So you cannot fix FR-007 by making the check
code-span-aware — the information is already gone. Uppercase-only matching, or BUG-12-style narrowing,
are the workable options.

**There are two marker detectors.** `matchesPlaceholder` in `shared/preflight` is what actually blocks
`create_specs`. `server.ts:396` is a separate one with its own rules. Fixing one and stopping is the
expected mistake (T012).

**Testing FR-001 locally proves nothing.** With no `projectId` the code takes the kit-author
filesystem fallback, which is the branch that was never broken. Verify against the hosted server.

## Start here

**T006** — give `list_open_items` authoritative spec identity. Everything in the `dbpush` line depends
on it.

The preflight tasks (**T010–T013**) are fully independent and are the cheapest visible win: they
unblock a customer who is currently rewording their own language to satisfy us.

Do not start **T015** — it needs `project.delete_scope` from SCOPE-098 T007–T009, which is not built.

## A note on this scope's own documents

The scope document and this spec cannot spell the marker tokens they are about; `create_specs` would
reject them. The first attempt to file SCOPE-124 scored **57 and was blocked**, naming those tokens.
That is the acceptance evidence for FR-007 — keep it when you fix the check.
