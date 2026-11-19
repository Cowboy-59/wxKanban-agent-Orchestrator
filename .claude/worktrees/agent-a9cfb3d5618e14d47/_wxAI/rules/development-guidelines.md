# Development Guidelines

<!--
WHAT BELONGS HERE: Implementation tips, how-to guidance, best practices, soft recommendations.
WHAT DOESN'T: Critical rules with enforcement (those go in constitution.md).
Rule of thumb: If violation is a CRITICAL ERROR, it's constitution. If it's guidance, it's here.
-->

**Note**: Critical rules (TypeScript, database, security) are in constitution.md. This document covers implementation guidance.

## Code Quality Tips

### Boolean Assignment

When assigning to boolean variables using chained `&&` operators, use strict boolean conversion:

```typescript
// ❌ WRONG - assigns truthy/falsy values
const isValid = user && user.email && user.verified;

// ✅ CORRECT - always assigns true or false
const isValid = !!(user && user.email && user.verified);
```

## Structured Logging (Pino)

For projects using Pino, all logging uses structured loggers. See `project-documentation/logging-with-pino.md`.

```typescript
import { logger } from "~/lib/logger";
logger.info("message");
logger.error({ err }, "error message");
logger.debug({ data }, "debug context");
```

**Collaborative Debugging**: Human runs dev server, AI monitors via `tail -f logs/server.log`.

## Toast Replacement Patterns

Toasts are deprecated (see constitution.md). Use these alternatives:

| Instead of        | Use                                              |
| ----------------- | ------------------------------------------------ |
| `toast.success()` | Inline state change, optimistic UI               |
| `toast.error()`   | Inline error message, form-level error, or modal |
| `toast.warning()` | Inline warning indicator                         |
| `toast.loading()` | Loading spinner in component                     |

## Web Development Standards

### Frontend Policy

- All icon-only buttons should include tooltips on hover

### Responsive Design

Consider responsive impact across mobile, tablet, and desktop breakpoints when making UI changes.

Evaluate:

- Mobile horizontal space constraints
- Text overflow/wrapping potential
- Touch target accessibility (minimum 44px)
- Grid/flex layout behavior changes
- Breakpoint classes: `sm:`, `md:`, `lg:`, `xl:`

### Web Styling & UI

- Use Tailwind CSS for styling
- Build from `shadcn/ui` primitives
- Semantic naming (ButtonActive not ButtonRed)
- Prefer semantic classes (`text-foreground`) over manual dark mode
- Use `cn()` utility for conditional CSS classes
- Consult ShadCN MCP for component guidance

## Mobile Development Standards

### Mobile Design Principles

- Touch targets: minimum 44px for accessibility
- Optimize for mobile performance and battery life
- Ensure cross-platform consistency (iOS/Android)

### Mobile Component Architecture

- Use React.memo and memoized callbacks for complex components
- Include proper ARIA labels and keyboard navigation
- Comprehensive error handling for external APIs

## Documentation Standards

**Location priority:**

1. Follow specific instructions in prompt or user request
2. Special files (`changelog.md`, `README.md`, `CLAUDE.md`) follow predefined locations
3. Temporary documents (disposable) go in `project-documentation/temporary`
4. Permanent documentation goes in `project-documentation`

**Content rules:**

- Only include current state, not historical decisions
- Follow existing file structure and style
- Check existing subfolders for suitable location

## Environment Configuration

- Preserve existing configuration when adding env vars
- Check for existing `.env` files before creating
- Read current values first, add only new variables

## Development Workflow

**Core Commands**:

- `npm run dev`: Start development server
- `npm run check-types`: TypeScript validation

### Database Query Access (psql)

For read-only queries and exports, use psql directly:

```bash
DATABASE_URL=$(grep "^DATABASE_URL=" .env | cut -d'=' -f2- | cut -d'#' -f1 | xargs)
psql "$DATABASE_URL" -c "SELECT * FROM tablename;"
```

## Code Health

- **Unused Code**: TypeScript TS6133/TS6192 detects unused declarations
- **Manual Verification**: Check for indirect usage before deleting flagged code
