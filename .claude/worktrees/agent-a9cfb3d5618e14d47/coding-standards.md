# Development Guidelines

## Core Principles

### Database Architecture

- **Table Naming**: Always use singular names (user not users, order not orders). Do not use phrases that may be SQL reserved words
- **Primary Keys**: Always named the same as the table name with the suffix id (userid, orderid)
- **Field Naming**: Use lowercase for PostgreSQL schema, camelCase for TypeScript variables, never use \_ or any other special character for word separation in variable names (firstname NEVER first_name)
- **Foreign Keys**: Foreign keys in child tables, should be the same name as the primary key they are linked to in the parent table whenever possible (customer.customerid -> invoice.customerid). If there are 2 foreign keys in one child table referring to the same parent table they should include a functional prefix. (employee.employeeid -> invoice.salesmanemployeeid and invoice.manageremployeeid)
- **Schema Changes**: Always ask for explicit permission before DROP, ALTER, or CREATE operations

### Frontend Policy

- Always ask before adding admin or debugging features to the frontend, unless asked to
- All icon-only buttons must include tooltips on hover

### Responsive Design Considerations

**ALWAYS consider and analyze responsive design impact before making ANY UI changes.**

When making UI changes, you MUST:

1. **Analyze responsive impact** across mobile, tablet, and desktop breakpoints
2. **Explicitly mention responsive considerations** in explanations
3. **Warn the user immediately** if a change could cause responsive issues
4. **Consider**: horizontal/vertical space usage, text wrapping, touch targets, grid/flex behaviors
5. **Test mentally** across breakpoints: `sm:`, `md:`, `lg:`, `xl:` classes
6. **Use ShadCN MCP** - for any work with shadcn components you MUST ALWAYS consult the ShadCN MCP for guidance.

**Evaluate every UI change for:**

- Mobile horizontal space constraints
- Text overflow/wrapping potential
- Touch target accessibility (minimum 44px)
- Grid/flex layout behavior changes
- Visual hierarchy on different screen sizes

**Never treat responsive design as an afterthought - it must be a primary consideration.**

## Coding Standards

### TypeScript & React

- Use TypeScript for all new JavaScript files
- Prefer functional components with hooks over class components
- Always include TypeScript types for function parameters and return values
- Use camelCase for all variables, properties, classes, functions (except PostgreSQL schema which is lowercase)
- Never use \_ or any other special character for word separation in variables names (firstname or FirstName NEVER first_name)

### Styling & UI

- Use Tailwind CSS for styling, avoid inline styles
- Use Semantic naming for all CSS or Tailwind classes (ButtonActive not ButtonRed)
- Maintain consistency with ShadCN/ui component patterns
- **Authentication Theming**: Use consistent dark/light mode classes for auth components (see constitution §XII)
- **Semantic Classes**: Prefer semantic classes (`text-foreground`, `text-muted-foreground`) over manual dark mode classes
- **Theme Integration**: Follow established baseTheme pattern: `baseTheme: theme === "dark" ? dark : undefined`
- **Formatter**: Biome with tab indentation and double quotes
- **Imports**: Auto-organized, external dependencies first
- **Components**: Use `cn()` utility for conditional CSS classes
- **Type Safety**: ORPC provides end-to-end type safety between frontend/backend

### Error Handling & Security

- Always implement proper error handling
- NEVER expose primary key IDs to end users or in URLs
- Use environment variables for sensitive data
- NEVER hardcode API keys or credentials

## Required Practices

### Code Quality

- Maintain type safety throughout the application
- Test integrations with real APIs, not mocks
- Follow established file organization patterns
- Keep components focused and reusable

### Documentation

- You MUST use the technical-documentation-specialist for all documentation tasks!
- Follow the structure and style of existing documentation files with technical accuracy and user-focused content
- For files in the `/project-documentation` folder, only include up-to-date documentation for each feature
- Include clear explanations of complex or tricky portions, with examples as needed
- NEVER change or update files in project-documentation\design-documentation unless explicitly asked to or working on feature planning

**What goes in `/project-documentation`:**

- **Comprehensive Feature Documentation**: Major features require detailed documentation following established format
- Permanent system documentation, architecture guides, API specifications
- User guides and operational documentation
- **If you think a new document should be created ask the user first**

### Data Integrity

- Treat all existing data as production data
- Never modify production data for testing purposes
- Never transfer data between users without explicit permission
- Implement proper user data isolation

## Forbidden Actions

### Database Operations

- No database schema modifications without explicit approval
- No SQL commands that modify database structure without permission
- No bypassing authentication for testing
- No creating test users or modifying user IDs in existing records

### Code Management

- No removing test endpoints or debug features without user approval
- No cleaning up testing code without explicit permission
- No substituting technology stack components
- No using underscores in variable, table, or field naming

### Environment Configuration

- **Never overwrite existing environment variables** without explicit user consent
- When adding new environment variables, preserve all existing configuration
- Always check for existing `.env` files before creating new ones
- Ask the user about their current environment setup before making changes
- If unsure about existing configuration, read the current values first and add only new variables

## Component Management

### Orphaned Components

- Alert user immediately when changes may create orphaned components
- Scan for orphaned components during refactoring
- Verify components are truly orphaned before removal (check imports, dynamic imports, indirect usage)
- Provide list of orphaned components for user examination

### File Organization

- Follow established directory structure patterns
- Maintain clear separation between features
- Use consistent naming conventions across the codebase

### Component Architecture Standards

- **Performance-First Design**: All complex components MUST use React.memo and memoized callbacks
- **Accessibility Compliance**: All interactive components MUST include proper ARIA labels and keyboard navigation
- **Error Boundaries**: Components handling external APIs MUST include comprehensive error handling and retry logic
- **Progressive Enhancement**: Components should work without AI features enabled and gracefully degrade
- **Reusability**: Design components for reuse across different contexts with proper prop interfaces
- **State Management**: Use appropriate state management (local state, context, or global store) based on scope
- **Authentication Components**: Follow official Clerk theming patterns and maintain NextAge branding consistency
- **Theme Consistency**: Ensure all components properly support both light and dark modes using semantic CSS classes
