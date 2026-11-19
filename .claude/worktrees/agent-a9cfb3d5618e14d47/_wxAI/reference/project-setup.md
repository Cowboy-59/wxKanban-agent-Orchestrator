# Reference — Project Structure & Setup

> On-demand reference module (SCOPE-093 / T001). Extracted from CLAUDE.md so it loads
> only when needed. Read this file when scaffolding, navigating the tree, setting up the
> dev environment, or preparing to implement a feature for the first time.

## Project Structure

```
wxKanban/
├── src/
│   ├── server/              # Express backend (routes, services, middleware)
│   ├── client/              # React frontend components and pages
│   ├── shared/              # Shared types and utilities
│   └── db/
│       └── schema/          # Drizzle ORM entity definitions
├── tests/                   # Vitest unit tests and Playwright E2E
├── specs/main/              # Design artifacts
│   ├── spec.md              # Feature specification
│   ├── data-model.md        # Entity definitions
│   ├── contracts/           # OpenAPI JSON
│   ├── quickstart.md        # Integration test scenarios
│   └── tasks.md             # Generated task breakdown
└── public/                  # Static assets
```

**Architecture**: Express API server (port 3001) + React/Vite client (port 3000) with shared types and database schema.

**Important**: See `specs/main/data-model.md` for entity definitions before implementing schema.

---

## Development Setup

```bash
# Initial setup
npm install
cp .env.example .env       # Setup environment variables

# Database
npm run db:generate        # Generate schema migrations
npm run db:migrate         # Apply migrations (dev only)

# Development
npm run dev:server         # Start Express API (port 3001)
npm run dev:client         # Start React app (port 3000)

# Type checking (REQUIRED before commit)
npm run check-types

# Testing
npm run test              # Vitest unit tests
npm run test:e2e          # Playwright E2E tests
```

---

## Before Implementing

1. **Read the data model** (`specs/main/data-model.md`) → Understand all 10 entities
2. **Study the OpenAPI spec** (`specs/main/contracts/openapi.json`) → See all endpoints
3. **Review quickstart scenarios** (`specs/main/quickstart.md`) → Understand workflows
4. **Check existing patterns** → Look at constitutional rules in `_wxAI/rules/`
