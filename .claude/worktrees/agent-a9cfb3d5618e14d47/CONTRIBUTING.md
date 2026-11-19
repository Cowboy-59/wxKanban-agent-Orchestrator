# Contributing to wxKanban

Thank you for your interest in contributing to wxKanban! This guide will help you set up your development environment and contribute to the project.

## Table of Contents

- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Technology Stack](#technology-stack)
- [Coding Standards](#coding-standards)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)

## Development Setup

### Prerequisites

- Node.js 20+ (download from https://nodejs.org)
- PostgreSQL 15+ (https://www.postgresql.org/download/)
- npm or yarn

### Initial Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd wxKanban
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and configure:
   - `DATABASE_URL`: PostgreSQL connection string
   - `JWT_SECRET`: Random string for JWT signing
   - API keys for external services (Stripe, Sendgrid, PM system OAuth)

4. **Setup database**
   ```bash
   npm run db:generate    # Generate migration files
   npm run db:migrate     # Apply migrations
   ```

5. **Start development servers**
   ```bash
   # Terminal 1: Backend
   npm run dev:server

   # Terminal 2: Frontend
   npm run dev:client
   ```

   Backend runs on `http://localhost:3001`
   Frontend runs on `http://localhost:3000`

## Project Structure

```
wxKanban/
├── src/
│   ├── server/               # Express backend
│   │   ├── routes/          # API endpoint handlers
│   │   ├── services/        # Business logic
│   │   ├── middleware/      # Authentication, validation, error handling
│   │   └── lib/             # Utilities (logger, database, crypto)
│   ├── client/              # React frontend
│   │   ├── pages/           # Page components
│   │   ├── components/      # Reusable React components
│   │   └── lib/             # Client utilities
│   ├── shared/              # Shared types and constants
│   └── db/
│       └── schema/          # Drizzle ORM entity definitions
├── tests/
│   ├── contract/            # Contract tests (API contracts)
│   ├── integration/         # Integration tests
│   └── e2e/                 # End-to-end tests
├── specs/                   # Feature specifications
└── docs/                    # Project documentation
```

## Technology Stack

### Backend
- **Express** - Web server framework
- **TypeScript** - Type-safe JavaScript
- **PostgreSQL** - Database
- **Drizzle ORM** - Database access
- **Zod** - Input validation
- **Pino** - Structured logging
- **JWT** - Authentication

### Frontend
- **React 18+** - UI library
- **Vite** - Build tool
- **TanStack Query** - Server state management
- **Tailwind CSS** - Styling
- **shadcn/ui** - Component library

### Testing
- **Vitest** - Unit and integration tests
- **Playwright** - E2E tests

## Coding Standards

### TypeScript

- **100% TypeScript** - No `any` types or `@ts-ignore`
- Use strict mode: `"strict": true` in tsconfig.json
- Use type inference where possible, explicit types for public APIs
- No unused variables (TS6133/TS6192)

### Code Style

- Follow ESLint configuration in `.eslintrc.json`
- Use Prettier for formatting: `npm run format`
- Imports: Organize by external, relative, and types
- Comments: Use JSDoc for public APIs and complex logic

### Naming Conventions

- **Files**: kebab-case (e.g., `user-service.ts`)
- **Types/Classes**: PascalCase (e.g., `UserService`)
- **Variables/Functions**: camelCase (e.g., `getUserById`)
- **Database**: Plural tables (e.g., `users` not `user`, `projects` not `project`)
- **Database fields**: lowercase (e.g., `createdat`, `userid`)

### Database

- **Use Drizzle ORM** for all database access
- **Define schemas** in `src/db/schema/` with one entity per file
- **Table names**: Plural, lowercase, no camelCase (e.g., `users`, `pmsystemconnections`, `invitationbatches`)
- **Column names**: Lowercase, no camelCase, no underscores (e.g., `userid`, `createdat`, `lastsyncsat`)
- **No word separation characters**: Use concatenation (e.g., `pmsystemconnections` not `pm_system_connections`)
- **Primary keys**: UUID v7 with field name `id` (e.g., `users.id`, `projects.id`)
- **Foreign keys**: Match parent table name + `id` (e.g., `userid` references `users.id`, `projectid` references `projects.id`)
- **Timestamps**: Use consistent naming (`createdat`, `updatedat`, `expiresat`, `completedat`, etc.)

**Schema Documentation**: See `project-documentation/DATABASE_SCHEMA.md` for complete table reference

### Logging

- Use Pino logger, NOT `console.log`
- Create named loggers: `const logger = createLogger('module-name')`
- Use structured logging with context objects
- Levels: `debug` (dev), `info` (events), `warn` (issues), `error` (failures)

### Error Handling

- Create custom error classes extending `AppError`
- Use try-catch in async functions
- Always log errors with context
- Return user-friendly error messages
- Don't expose internal details in error messages

### Security

- Never hardcode secrets - use environment variables
- Validate all user input with Zod schemas
- Hash passwords with bcrypt
- Use httpOnly cookies for JWT tokens
- Implement rate limiting for sensitive endpoints
- Validate data ownership before returning

## Making Changes

### Before You Start

1. Check existing issues and pull requests
2. Open an issue for new features or discuss changes
3. Create a branch: `git checkout -b feature/short-description`
4. Keep commits focused and well-described

### During Development

1. **Type check frequently**
   ```bash
   npm run check-types
   ```

2. **Run tests**
   ```bash
   npm run test          # Unit and integration tests
   npm run test:e2e      # End-to-end tests
   ```

3. **Format code**
   ```bash
   npm run format
   ```

### Git Workflow

- Commit messages should be clear and descriptive
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, etc.
- Example: `feat: add user authentication with JWT`
- Keep pull requests focused on a single feature or fix

## Testing

### Unit & Integration Tests

Write tests using Vitest. Place tests in `tests/contract/` or `tests/integration/`.

```typescript
import { describe, it, expect } from 'vitest';

describe('UserService', () => {
  it('should hash passwords with bcrypt', async () => {
    const password = 'TestPassword123!';
    const hashed = await hashPassword(password);
    expect(hashed).not.toBe(password);
    expect(await verifyPassword(password, hashed)).toBe(true);
  });
});
```

### Running Tests

```bash
npm run test              # Run all tests
npm run test:watch       # Watch mode for development
npm run test:coverage    # Generate coverage report
```

### Contract Tests

Contract tests verify API endpoints meet their specifications. Example:

```typescript
it('should return 401 without authentication', async () => {
  const response = await fetch('/api/users');
  expect(response.status).toBe(401);
});
```

## Submitting Changes

### Before Submitting

1. **Verify changes compile**
   ```bash
   npm run check-types
   ```

2. **Run all tests**
   ```bash
   npm run test
   ```

3. **Format code**
   ```bash
   npm run format
   ```

4. **Review your own changes** for code quality and security

### Creating a Pull Request

1. Push your branch to the repository
2. Open a pull request with a clear description
3. Include:
   - What changes you made
   - Why you made them
   - How to test the changes
   - Any breaking changes
   - Related issues

4. Respond to code review feedback

### After Merge

- Your changes will be deployed to staging first
- Monitor for any issues
- Celebrate! 🎉

## Common Tasks

### Adding a New API Endpoint

1. Create validation schema in the routes file
2. Implement service method in `src/server/services/`
3. Add route handler in `src/server/routes/`
4. Add contract test in `tests/contract/`
5. Register route in `src/server/index.ts`
6. Document endpoint in API docs

### Adding a New Frontend Component

1. Create component in `src/client/components/`
2. Use React hooks (no class components)
3. Add PropTypes or TypeScript interfaces
4. Export from component index if in a folder
5. Add example usage in tests

### Database Changes

1. Modify schema in `src/db/schema/`
2. Generate migration: `npm run db:generate`
3. Review generated SQL
4. Apply migration: `npm run db:migrate`
5. Update services to use new schema
6. Update tests

## Getting Help

- **Issues**: Check existing issues or create a new one
- **Documentation**: See `docs/` folder
- **Slack/Discord**: Join our community chat (if available)
- **Email**: Contact the maintainers

## Code Review Guidelines

Reviews will check for:

- ✅ TypeScript compilation (no errors)
- ✅ Tests pass and new code has coverage
- ✅ Security: no hardcoded secrets, proper validation
- ✅ Performance: reasonable database queries
- ✅ Style: consistent with project standards
- ✅ Documentation: updated if needed

---

**Thank you for contributing to wxKanban!** Your efforts help make this project better for everyone. 🙏
