# Spec 016: wxKanban Online Help System

## Overview

Build a comprehensive online help system for wxKanban that stores help articles, CLI commands documentation, and user guides in a database table. This system will provide contextual help within the application and serve as a searchable knowledge base.

---

## Database Schema

### Table: `wxkanbanhelp`

**Location:** `src/db/schema/wxkanbanhelp.ts`

```typescript
// Core fields
id: UUID (primary key)
category: VARCHAR(50) - 'cli', 'ui', 'api', 'guide', 'faq', 'troubleshooting', 'reference'
subcategory: VARCHAR(50) - e.g., 'database', 'testing', 'deployment'

// Content fields
title: VARCHAR(255)
slug: VARCHAR(255) - URL-friendly unique identifier
description: VARCHAR(500)
content: TEXT - Markdown content
contentType: VARCHAR(20) - 'markdown', 'html', 'text'

// CLI-specific fields (for command documentation)
command: VARCHAR(255) - Full command string
commandAlias: VARCHAR(50) - Short alias
usage: TEXT - Usage examples
arguments: TEXT - JSON array of arguments
options: TEXT - JSON array of options
examples: TEXT - JSON array of example commands

// Metadata
tags: TEXT - JSON array of searchable tags
relatedTopics: TEXT - JSON array of related help IDs
prerequisites: TEXT - JSON array of prerequisite knowledge

// Versioning
version: VARCHAR(20) - Content version
minAppVersion: VARCHAR(20) - Minimum wxKanban version
maxAppVersion: VARCHAR(20) - Maximum version (for deprecated features)

// Status and visibility
status: VARCHAR(20) - 'active', 'draft', 'deprecated', 'archived'
visibility: VARCHAR(20) - 'public', 'internal', 'admin'

// Engagement metrics
viewCount: INTEGER
helpfulCount: INTEGER
notHelpfulCount: INTEGER

// Search optimization
searchKeywords: TEXT - Comma-separated keywords
isSearchable: BOOLEAN

// Audit timestamps
createdAt: TIMESTAMP
updatedAt: TIMESTAMP
publishedAt: TIMESTAMP
deprecatedAt: TIMESTAMP

// Author information
createdBy: UUID - Reference to userprofiles
updatedBy: UUID - Reference to userprofiles
reviewedBy: UUID - Reference to userprofiles (for approval)
```

---

## User Stories

### US-016-01: Search Help Articles
**As a** wxKanban user  
**I want to** search for help articles by keywords  
**So that** I can quickly find solutions to my questions

**Acceptance Criteria:**
- Full-text search across title, description, content, and tags
- Filter by category and subcategory
- Sort by relevance, view count, or date
- Highlight matching keywords in results
- Return results in under 500ms

### US-016-02: View CLI Command Help
**As a** wxKanban developer  
**I want to** view detailed documentation for CLI commands  
**So that** I can understand how to use the command-line tools

**Acceptance Criteria:**
- Display command syntax with proper formatting
- Show all available options and arguments
- Provide copy-to-clipboard functionality for commands
- Display related commands
- Show version compatibility information

### US-016-03: Contextual Help
**As a** wxKanban user  
**I want to** access help relevant to my current page/feature  
**So that** I can get guidance without leaving the application

**Acceptance Criteria:**
- Help icon/button on every major page
- Contextual help panel slides in from right
- Pre-filtered help articles based on current route
- Quick links to most relevant articles
- Option to search within contextual help

### US-016-04: Rate Help Articles
**As a** wxKanban user  
**I want to** rate whether a help article was helpful  
**So that** the system can prioritize better content

**Acceptance Criteria:**
- Thumbs up/down buttons on each article
- Optional feedback text field
- Update helpful/notHelpful counts in real-time
- Show aggregate ratings to users
- Track ratings per user to prevent duplicates

### US-016-05: Admin Help Management
**As a** wxKanban admin  
**I want to** create, edit, and manage help articles  
**So that** I can maintain accurate documentation

**Acceptance Criteria:**
- Rich text editor with markdown support
- Preview mode before publishing
- Version control with draft/published states
- Bulk import from markdown files
- Review workflow with approval process
- Analytics dashboard showing views and ratings

---

## API Endpoints

### Public Endpoints

```
GET /api/help/search?q={query}&category={cat}&limit={n}
- Search help articles
- Returns: Array of help articles with relevance scores

GET /api/help/articles/{slug}
- Get single help article by slug
- Returns: Full article content
- Increments viewCount

GET /api/help/categories
- List all categories and subcategories
- Returns: Category tree with article counts

GET /api/help/related/{slug}
- Get related articles
- Returns: Array of related help articles

GET /api/help/cli-commands
- Get all CLI command documentation
- Returns: Array of CLI command help entries

POST /api/help/{id}/rate
- Rate article as helpful/not helpful
- Body: { helpful: boolean, feedback?: string }
```

### Admin Endpoints

```
GET /api/admin/help/articles
- List all articles with filters
- Query params: status, visibility, category, author

POST /api/admin/help/articles
- Create new help article
- Body: Article creation data

PUT /api/admin/help/articles/{id}
- Update existing article
- Body: Article update data

DELETE /api/admin/help/articles/{id}
- Soft delete (mark as archived)

POST /api/admin/help/import
- Bulk import from markdown files
- Body: { files: Array<{filename, content}> }

GET /api/admin/help/analytics
- Get usage analytics
- Returns: Views, ratings, search queries over time
```

---

## Frontend Components

### Help Components

```
src/client/components/help/
├── HelpPanel.tsx           # Slide-out help panel
├── HelpSearch.tsx          # Search input with suggestions
├── HelpArticle.tsx         # Full article display
├── HelpArticleCard.tsx     # Article preview card
├── HelpCategoryList.tsx    # Category navigation
├── CLIDocumentation.tsx    # CLI command display
├── ContextualHelp.tsx      # Context-aware help button
├── HelpRating.tsx          # Rating buttons
└── HelpAdmin/
    ├── ArticleEditor.tsx   # Rich text editor
    ├── ArticleList.tsx     # Admin article management
    ├── ImportTool.tsx      # Markdown import
    └── Analytics.tsx       # Usage analytics
```

### Pages

```
src/client/pages/
├── HelpPage.tsx            # Main help center
├── HelpArticlePage.tsx     # Individual article view
├── HelpSearchResults.tsx   # Search results page
└── AdminHelpPage.tsx       # Admin management interface
```

---

## CLI Integration

### Help Import Tool

Create a CLI tool to populate the help system from existing documentation:

```bash
npx tsx cli/import-help.ts --source _wxAI-global/CLI_COMMANDS.md --category cli
```

**Features:**
- Parse markdown files and extract help articles
- Auto-generate slugs from titles
- Detect CLI commands and format appropriately
- Create related topic links
- Support bulk import with dry-run mode

### Help Export Tool

```bash
npx tsx cli/export-help.ts --format markdown --output docs/
```

**Features:**
- Export help articles to markdown files
- Maintain directory structure based on categories
- Useful for offline documentation or GitHub wiki

---

## Migration Script

**Location:** `src/db/migrations/0011_create_wxkanbanhelp_table.sql`

```sql
-- Create wxkanbanhelp table
CREATE TABLE IF NOT EXISTS "wxkanbanhelp" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "category" VARCHAR(50) NOT NULL,
    "subcategory" VARCHAR(50),
    "title" VARCHAR(255) NOT NULL,
    "slug" VARCHAR(255) NOT NULL UNIQUE,
    "description" VARCHAR(500),
    "content" TEXT NOT NULL,
    "contenttype" VARCHAR(20) NOT NULL DEFAULT 'markdown',
    "command" VARCHAR(255),
    "commandalias" VARCHAR(50),
    "usage" TEXT,
    "arguments" TEXT,
    "options" TEXT,
    "examples" TEXT,
    "tags" TEXT,
    "relatedtopics" TEXT,
    "prerequisites" TEXT,
    "version" VARCHAR(20) NOT NULL DEFAULT '1.0.0',
    "minappversion" VARCHAR(20),
    "maxappversion" VARCHAR(20),
    "status" VARCHAR(20) NOT NULL DEFAULT 'active',
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'public',
    "viewcount" INTEGER NOT NULL DEFAULT 0,
    "helpfulcount" INTEGER NOT NULL DEFAULT 0,
    "nothelpfulcount" INTEGER NOT NULL DEFAULT 0,
    "searchkeywords" TEXT,
    "issearchable" BOOLEAN NOT NULL DEFAULT true,
    "createdat" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedat" TIMESTAMP NOT NULL DEFAULT NOW(),
    "publishedat" TIMESTAMP,
    "deprecatedat" TIMESTAMP,
    "createdby" UUID,
    "updatedby" UUID,
    "reviewedby" UUID
);

-- Create indexes for performance
CREATE INDEX "idx_wxkanbanhelp_category" ON "wxkanbanhelp"("category");
CREATE INDEX "idx_wxkanbanhelp_subcategory" ON "wxkanbanhelp"("subcategory");
CREATE INDEX "idx_wxkanbanhelp_status" ON "wxkanbanhelp"("status");
CREATE INDEX "idx_wxkanbanhelp_visibility" ON "wxkanbanhelp"("visibility");
CREATE INDEX "idx_wxkanbanhelp_slug" ON "wxkanbanhelp"("slug");
CREATE INDEX "idx_wxkanbanhelp_search" ON "wxkanbanhelp" USING gin(to_tsvector('english', "title" || ' ' || "description" || ' ' || "content"));
```

---

## Initial Data Population

Seed the help system with CLI documentation from `_wxAI-global/CLI_COMMANDS.md`:

```typescript
// scripts/seed-help-system.ts
// Imports CLI commands and creates help articles
// Run: npx tsx scripts/seed-help-system.ts
```

**Seed Data Includes:**
- All CLI commands with descriptions
- Database testing commands
- Migration commands
- Development server commands
- Testing commands
- Code quality commands

---

## Search Implementation

### Full-Text Search

Use PostgreSQL full-text search with tsvector:

```sql
-- Search query example
SELECT 
    id,
    title,
    slug,
    ts_rank(search_vector, query) as relevance
FROM wxkanbanhelp, 
    plainto_tsquery('english', 'database migration') query
WHERE search_vector @@ query
ORDER BY relevance DESC;
```

### Frontend Search

```typescript
// Debounced search with autocomplete
// Highlights matching terms
// Shows category filters
// Recent searches cache
```

---

## UI/UX Design

### Help Panel (Slide-out)

```
┌─────────────────────────────────────┐
│  Help                    [X]        │
├─────────────────────────────────────┤
│  🔍 Search help...                  │
├─────────────────────────────────────┤
│  📁 Categories                      │
│    ├── CLI Commands                 │
│    ├── UI Guides                    │
│    ├── API Reference                │
│    └── Troubleshooting              │
├─────────────────────────────────────┤
│  📄 Related Articles                │
│    • Database Testing               │
│    • Running Migrations             │
│    • Common Issues                  │
├─────────────────────────────────────┤
│  [View Full Help Center →]          │
└─────────────────────────────────────┘
```

### Article View

```
┌──────────────────────────────────────────────┐
│  Home > CLI > Database Testing               │
│                                              │
│  # Test All Database Tables                  │
│                                              │
│  ```bash                                     │
│  npx tsx cli/test-all-tables.ts              │
│  ```                                         │
│                                              │
│  This command tests all 33 database...       │
│                                              │
│  ## Usage                                    │
│  ...                                         │
│                                              │
│  Was this helpful? 👍 👎                     │
└──────────────────────────────────────────────┘
```

---

## Success Metrics

- **Coverage:** 100% of CLI commands documented
- **Search Performance:** < 500ms average response time
- **User Engagement:** > 50% of users access help within first week
- **Article Quality:** > 80% helpful rating average
- **Search Success:** > 70% of searches return relevant results

---

## Future Enhancements

- AI-powered search with natural language queries
- Video tutorials embedded in articles
- Interactive CLI command builder
- User-contributed tips and examples
- Multi-language support
- Offline help PWA support

---

## Related Files

- Schema: `src/db/schema/wxkanbanhelp.ts`
- Migration: `src/db/migrations/0011_create_wxkanbanhelp_table.sql`
- CLI Import: `cli/import-help.ts`
- Seed Script: `scripts/seed-help-system.ts`
- Global CLI Docs: `_wxAI-global/CLI_COMMANDS.md`

---

**Status:** Ready for Implementation  
**Priority:** Medium  
**Estimated Effort:** 3-4 days
