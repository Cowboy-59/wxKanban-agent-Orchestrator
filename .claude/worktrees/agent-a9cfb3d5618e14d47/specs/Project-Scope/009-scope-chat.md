# Scope Chat — Conversational Scope Creation

**Status**: clarified — ready for speckit pipeline

Split from `008-scope.md`.

---

## What This Covers

The **Scope Chat** is an AI-assisted conversation interface embedded in the Design phase of a project. When a user opens a scope in `draft` status, they can click "Discuss this scope" to enter a split-panel view where the AI asks clarifying questions, writes scope content in real time, and detects when areas should be split into separate scopes.

---

## AI Context (what the AI receives before the conversation starts)

The AI is given the following context before the first message:

1. **Project overview document** — the full overview generated at project creation (name, description, core modules, tech stack, target users, integration points)
2. **All existing scopes in the project** — number, title, and current content of every other scope, so it understands what is already covered
3. **Current scope stub** — the number, name, and any content already in this scope
4. **Phase assignments** — who owns each phase, so the AI can factor in team structure when suggesting scope boundaries

This context allows the AI to reason about the full project when helping define a new scope.

---

## Conflict Detection Before Acceptance

Before the user can click "Finalize Scope" (moving status from `draft` to `clarified`), the AI runs a **conflict check** against all other scopes in the project:

- Scans for functional overlap: does this scope define behavior already covered in another scope?
- Checks for contradictory data model decisions (e.g., two scopes both claiming ownership of the same entity)
- Flags any integration points that depend on a scope that doesn't exist yet

If conflicts are found, the AI presents them inline in the chat before finalization is allowed:

> "Before finalizing: this scope overlaps with `002-accounting` on invoice generation. Recommend splitting invoice generation there, or explicitly marking this scope as the owner and updating 002."

ADMIN can acknowledge and override, or resolve the conflict by editing the scope content. The conflict check result and any override are logged to `companyauditlogs`.

---

## Conversation Export

The full conversation transcript is exportable at any time:

- **Format**: Markdown (default) or plain text
- **Triggered by**: "Export conversation" button in the Scope Chat panel
- **Content**: All turns in order (role label + content), with timestamps, scoped to the current scope
- **Access**: Same as chat access — phase assignee and ADMIN only

Export does not lock or change scope status. It is a read-only operation.

---

## Split-Panel UI Layout

### Desktop

Two panels separated by a **draggable divider**:

- Left = Chat interface
- Right = Live scope document preview
- Default split: 50/50
- Divider position saved per user (persisted to `userprofiles` or a user preferences store)
- Minimum width for each panel: 320px (prevents either panel becoming unusable)

### Mobile / Narrow Screens

Panels stack vertically:

- Chat on top
- Preview below
- Single scrollable column
- No tab switching — both are visible, just scrolled to

### Preview Panel — Editing

The preview panel is a **fully editable Markdown editor** at all times. The user can type directly in it while the AI is also writing to it. There is no lock or mode switch.

Merge behavior: AI appends or rewrites sections based on the conversation. If the user has manually edited a section, the AI preserves user-edited content and writes only to other sections unless explicitly asked to rewrite a specific part.

---

## Real-Time Content Writing

### Streaming with section locking

AI writes content **token by token** (streaming) into the preview panel. The specific section the AI is currently writing to is **temporarily locked** — the user cannot edit that section until the AI finishes it. All other sections remain fully editable while streaming is in progress.

Visual indicators during streaming:

- Blinking cursor at the insertion point in the locked section
- Locked section has a subtle highlight/border to signal it is AI-controlled at that moment
- Section unlocks immediately when the AI moves on or finishes

### Conflict rule: user input cancels AI write for that section

If the user clicks into a section the AI is currently streaming to and starts typing, the AI **immediately stops writing to that section** and releases the lock. The user's input takes priority. The AI continues writing to other sections or waits for the next message before resuming.

This means:

- No user edits are ever overwritten by the AI
- The AI may leave a section partially written if the user interrupts — that is expected and acceptable
- The user can type "continue here" in chat to ask the AI to resume that section

---

## Scope Split Detection and Workflow

### Signals — any one of these triggers a split suggestion

The AI monitors the conversation and the preview content for:

1. **Distinct user-facing module** — a clearly separate feature surface emerges (e.g., invoicing within accounting) that a different person could own and deliver independently
2. **Task volume** — the AI estimates this scope would generate more than ~15 implementation tasks, making it too large for one coherent unit of work
3. **Different team owner** — the area logically belongs to a different phase assignee or team member than the rest of the scope content
4. **Different delivery timeline** — the area is clearly deferred or belongs to a later release while the rest of the scope ships now; splitting lets the team sequence it separately

The AI raises a split suggestion **at most once per topic area** — it does not repeatedly suggest the same split if the user declines.

### Split prompt

When a signal is detected, the AI pauses mid-conversation and asks:

> "This area — [topic] — looks like it could stand alone as its own scope. Suggested name: `NNN-short-name`. Should I split it out?"

If **yes**: proceeds with the split workflow below.
If **no**: AI notes the decision, does not suggest the same split again, and continues.

### Split workflow

1. AI identifies the content in the preview panel that belongs to the split area
2. That content is **extracted from the current scope** — removed from the preview panel
3. A new `specifications` record is created: next available number, suggested name, extracted content as body, status `draft`
4. The current scope preview updates immediately to reflect the removal
5. AI posts a single notification in the chat: `"Created 003-accounting-invoices (draft). You can discuss it separately any time."`
6. AI continues the current conversation without pause — no user prompt needed to resume

### New stub content

The stub contains only what was extracted — the exact text pulled from the current scope. It is minimal by design: enough to identify what the scope covers, not a full write-up. The full discussion happens when the user opens that stub and clicks "Discuss this scope."

No duplicate content: after the split, the extracted area exists **only** in the new stub.

---

## Finalize Scope Action

Clicking "Finalize Scope" moves status from `draft` to `clarified` and locks the chat panel — no further AI messages or chat input. The preview panel remains directly editable.

### Auto-revert on edit

If the scope content is edited **after** finalization (by any user with edit access), the status automatically reverts from `clarified` back to `draft`. This prevents a stale `clarified` state where the content no longer matches what was signed off.

The user must click "Finalize Scope" again to return to `clarified`. This is intentional — it enforces that `clarified` always means "current content has been reviewed and is ready."

No notification is sent on auto-revert. The status change is visible in the scope list and audit log.

---

## Scope Approval Workflow (Phase 1 gate)

After a scope reaches `clarified`, it must be **approved** before Phase 1 can be marked complete.

### Who can approve

- Phase 1 assignee (the team member assigned to the Design phase on this project)
- ADMIN (always can approve regardless of phase assignment)

### Approval flow

1. Scope is at `clarified`
2. Approver reviews the preview panel content
3. Approver selects one of three actions:

**Approve** — status moves to `approved`, logged to `companyauditlogs`. AI task generation offer appears (defined in 008-scope.md).

**Request changes** — approver adds a note describing what needs to change. Status reverts to `draft`. Scope creator is notified in-app with the note. Creator addresses the changes and re-finalizes.

**Request clarification** — approver indicates the scope needs discussion before a decision can be made. Two sub-options:

- **Add clarification note** — approver writes a question or concern inline; scope status stays at `clarified` (not reverted); Scope Chat is re-opened so the creator can respond in the conversation; once the creator responds, approver is notified to re-review
- **Request a meeting** — approver flags the scope as needing a synchronous discussion; scope status moves to a `pending_clarification` hold state; a note is attached ("Meeting requested by [approver]"); no tasks can be generated until resolved; ADMIN can override the hold at any time

`pending_clarification` is a transient state — scope returns to `clarified` once the approver marks the clarification resolved, or to `draft` if changes are required after the discussion.

---

## Access Levels in Scope Chat

| Role | Chat | Preview editing | Comments |
|---|---|---|---|
| ADMIN | Full | Yes | Yes |
| Phase 1 assignee | Full | Yes | Yes |
| Other project members | None | No | Yes — read and comment only |
| Non-project users | No access | No access | No access |

**Comments**: Project members who are not the phase assignee or ADMIN can read the full conversation history and leave comments on individual turns (threaded, not AI-driven). They cannot send chat messages to the AI or edit the preview panel.

---

## DB Table — `scopeconversations`

```sql
id        UUID PK
scopeid   UUID FK -> specifications.id  ON DELETE CASCADE
role      VARCHAR(10)   -- 'user' or 'assistant'
content   TEXT
createdat TIMESTAMP
```

---

## Open Questions

- Token/length limit per conversation or per turn: TBD — defer to implementation; no hard limit in scope, rely on model context window.
