# Quickstart: Spec Status Vocabulary (Spec 122)

## The one-paragraph version

Two status vocabularies exist. The MCP writes eight values; the Kanban board only knew four of them.
A scope set to one of the other four was written successfully and then rendered in **no column at
all**, because placement is a lookup whose miss-case silently filters the card out of every column.
Fix the map, then fix the miss-case so this cannot recur.

## Where the bug lives

```
src/client/components/Projects/ScopeKanbanBoard.tsx
  STATUS_TO_COLUMN            ← knows 4 of the MCP's 8 values
  filteredScopes.filter((s) => STATUS_TO_COLUMN[s.status] === columnId)
                              ← undefined === columnId is false for EVERY column
mcp-server/src/utils/schemas.ts
  SpecStatusSchema            ← the other 8-value vocabulary
```

## Reproduce it

1. Set any scope's status to `beta` via `project.update_spec_status`. The call succeeds.
2. Open the project's Kanban board. The scope is in no column — not Phase 5, not Deferred, nowhere.
3. Confirm the data is fine with `project_cockpit_summary`: status `beta`, remaining 0.

Step 3 is what makes this hard to diagnose from the outside — every surface except the board says the
row is healthy.

## Build and test

```bash
npm run dev                 # Express + Vite
npx vitest run              # unit tests
npm run typecheck           # tsc --noEmit
```

MCP-side tests:

```bash
cd mcp-server && npx vitest run
```

Note the pre-existing baseline in `mcp-server`: 14 failures in `integration.test.ts` and
`project-kit-scope-flow.test.ts` that need a live DB and fixture files. If the count moves off 14,
that is your regression.

## The trap to avoid

Do **not** stop after adding the four missing values to the map. That fixes today's symptom and
leaves the failure mode intact — the next divergence will be exactly as silent. The resolver with a
visible fallback (T002) is the part that actually closes this.

## Delivery

The board is the **hosted web app**, so the rendering fix reaches every customer on deploy. No kit
update, no customer action, and **no writes to customer data**. Only the MCP-side validation (T005)
rides a kit/MCP release, and that is hardening against future bad writes rather than the fix.
