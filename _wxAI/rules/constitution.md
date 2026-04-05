# Constitution

<!--
WHAT BELONGS HERE: Critical rules with enforcement. Violations are CRITICAL ERRORS.
WHAT DOESN'T: Implementation tips, how-to guidance (those go in development-guidelines.md).
Rule of thumb: If hook-enforced or causes breakage, it's here. If it's guidance, it's not.
-->

Global rules for all projects. Violations are critical errors.

## I. Full-Stack Architecture

This project uses a modern React frontend with Express/Fastify backend architecture. All development must adhere to this stack:

- **Frontend Framework**: React 18+ with TypeScript
- **Backend Framework**: Express or Fastify (Node.js)
- **Database**: PostgreSQL with Drizzle ORM
- **Authentication**: Custom JWT-based with bcrypt password hashing, httpOnly refresh tokens, and token family reuse detection for breach prevention
- **State Management**: React Context API or Zustand (no Redux)
- **API Communication**: RESTful APIs with type-safe contracts

---

## II. The Third-Party Library Rule

**Default assumption**: If something doesn't work, YOU ARE USING IT WRONG.

Before blaming any library:

1. Use **Ref MCP** to read official documentation
2. Search for GitHub issues or Stack Overflow confirming the bug
3. Only claim library bug if you find **multiple independent sources** documenting it

Never blame the library without proof. The fault is almost certainly in your code.

## II. Questions Before Code

**When asked a question, ANSWER IT FIRST.**

| Allowed                  | Forbidden                           |
| ------------------------ | ----------------------------------- |
| Investigate codebase     | Write code in response to question  |
| Research (web, Ref, Exa) | Change code in response to question |
| Read/analyze files       | Assume what code to write           |

**Why?** Until the question is answered and user responds with direction, any code is guesswork.

**Exception**: User explicitly says "do it", "implement this", "fix that bug".

## III. TypeScript Quality (Zero Tolerance)

**No TypeScript errors in committed code.** Enforced by git pre-commit hook.

**LSP diagnostics are authoritative.** The LSP tool provides real-time TypeScript diagnostics. These errors are NOT suggestions - they are compilation failures. Ignoring LSP-reported errors is a CRITICAL FAILURE.

| Forbidden Pattern | Why                    | Fix              |
| ----------------- | ---------------------- | ---------------- |
| `_unusedVar`      | Hides dead code        | DELETE the code  |
| `: any`           | Disables type checking | Use proper types |
| `// @ts-ignore`   | Hides errors           | Fix the issue    |
| `as any`          | Bypasses checking      | Type narrowing   |

| Error                     | Fix           |
| ------------------------- | ------------- |
| TS6133 (unused)           | DELETE        |
| TS7006 (implicit any)     | Add type      |
| TS2339 (property missing) | Fix type def  |
| TS2322 (type mismatch)    | Fix at source |

## IV. No Console.log

**console.log is FORBIDDEN.** Enforced by PreToolUse hook.

Use Pino structured logging with namespaced loggers.

## V. Database & Naming

| Convention   | Rule                                       |
| ------------ | ------------------------------------------ |
| Tables       | **Plural** (`users` not `user`, `projects` not `project`) |
| Primary keys | `id` (e.g., `id`) using UUID v7 |
| Foreign keys | Match parent PK name                       |
| DB fields    | `lowercase`                                |
| TS variables | `camelCase`                                |
| Underscores  | **FORBIDDEN** for word separation          |

**Table Naming Examples:**
- ✅ CORRECT: `users`, `projects`, `tasks`, `invoices`, `pmsystemconnections`
- ❌ WRONG: `user`, `project`, `task`, `invoice`, `pmsystemconnection`

**Entity names**: Use actual database names in code. `users` not `user`, `projects` not `project`.

**AI restriction**: NEVER run migration commands (`db:generate`, `db:migrate`, `db:push`). Request human assistance.

## VI. Security

- Environment variables for all secrets. NEVER hardcode.
- Never overwrite env vars without explicit consent.
- No schema modifications (`DROP`, `ALTER`, `CREATE`) without approval.
- Error messages must not expose internal details.
<<<<<<< HEAD
- **Authentication**: Custom JWT implementation required (no third-party auth providers). Implement:
=======
- **Authentication**: Custom JWT implementation required (NOT third-party auth like Clerk). Implement:
>>>>>>> origin/014-sysadmin-platform-admin
  - bcrypt password hashing (12+ salt rounds, never plaintext)
  - Access token (short-lived, 15 minutes, in-memory storage)
  - Refresh token (7 days, httpOnly cookie, securely hashed in database)
  - Token family tracking to detect breach/reuse attempts (revoke entire family on reuse)

## VII. Early Development Philosophy

**No backward compatibility.** Breaking changes preferred over technical debt.

- Complete replacement over gradual migration
- Drop deprecated code entirely after migration
- No compatibility layers
- Single source of truth

## VIII. No Toast Messages

Toasts are deprecated. Use contextual feedback instead. See `development-guidelines.md` for alternatives.

**Exception**: Clipboard copy confirmation only.

**Cleanup**: When editing files with toasts, migrate them.

## IX. Debugging Protocol

**New code is guilty until proven innocent.**

1. **Assume recent changes broke it** - Check code from last session/PR first
2. **Trust stable infrastructure** - Production code (weeks old) is probably correct
3. **Reproduce** - Minimal reproduction case
4. **Isolate** - Identify failing component
5. **Root cause** - Trace to source, not symptoms
6. **Fix** - Implement with verification
7. **Defend** - Add test to prevent regression

## X. Code Standards

- TypeScript required. Functional components with hooks.
- Production code NEVER imports from `docs/`, `specs/`, `project-documentation/`.
- Test with real APIs, not mocks.
- Architecture separation: validation inline in production code, not imported from spec files.

## XI. LSP Tool Usage

**Use LSP for semantic code intelligence.** The LSP tool provides type-aware analysis superior to text-based search.

| Operation            | Use For                             |
| -------------------- | ----------------------------------- |
| `goToDefinition`     | Find where symbol is defined        |
| `findReferences`     | Find all usages of a symbol         |
| `hover`              | Get type info and documentation     |
| `documentSymbol`     | List all symbols in a file          |
| `workspaceSymbol`    | Search symbols across codebase      |
| `goToImplementation` | Find interface implementations      |
| `incomingCalls`      | Find callers of a function          |
| `outgoingCalls`      | Find functions called by a function |

**When to use LSP vs Grep:**

- **LSP**: Type-aware queries ("what calls this function?", "what implements this interface?")
- **Grep**: Text pattern matching ("find all TODO comments", "find hardcoded strings")

**Diagnostics**: LSP provides real-time TypeScript errors. See Section III - ignoring these is a CRITICAL FAILURE.

## XII. Dark / Light Mode (Zero Tolerance)

**Every UI component MUST support both dark and light modes.** Hardcoded light-only colors are a CRITICAL ERROR.

**How it works**: `tailwind.config.js` uses `darkMode: 'class'`. The `dark` class on `<html>` activates dark mode. All color classes must have a paired `dark:` variant.

**Required pattern** for every color token:

| Property | Light | Dark |
| -------- | ----- | ---- |
| Page background | `bg-gray-50` | `dark:bg-gray-900` |
| Card / surface | `bg-white` | `dark:bg-gray-800` |
| Border | `border-gray-200` | `dark:border-gray-700` |
| Primary text | `text-gray-900` | `dark:text-white` |
| Secondary text | `text-gray-600` | `dark:text-gray-400` |
| Muted text | `text-gray-500` | `dark:text-gray-400` |
| Success bg | `bg-green-50` | `dark:bg-green-900/20` |
| Error bg | `bg-red-50` | `dark:bg-red-900/20` |
| Warning bg | `bg-yellow-50` | `dark:bg-yellow-900/20` |
| Info bg | `bg-blue-50` | `dark:bg-blue-900/20` |

**Forbidden patterns** (light-only, no dark variant):

```tsx
// ❌ WRONG — hardcoded light color
<div className="bg-white text-gray-900">

// ✅ CORRECT — paired dark variant
<div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">
```

**Enforcement**: When editing any component, audit all color classes in that file. If any lack `dark:` variants, add them before committing. Do not leave light-only colors in touched files.
