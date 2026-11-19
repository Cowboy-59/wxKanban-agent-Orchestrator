# Implementation Plan: wxKanban Online Help System (Spec 016)

## Technical Context

### Tech Stack
- **Frontend:** React + TypeScript + Vite + Tailwind CSS
- **Backend:** Express + TypeScript + Drizzle ORM
- **Database:** PostgreSQL with full-text search
- **State Management:** React Query for server state
- **UI Components:** Existing component library

### Existing Infrastructure
- Database schema already created (`wxkanbanhelp` table)
- Migration executed with 19 CLI help articles seeded
- API routes structure exists in `src/server/routes/`
- Frontend routing exists in `src/client/App.tsx`

## Constitution Check

### Project Rules Compliance
- ✅ Database schema follows naming conventions (lowercase, no plurals)
- ✅ TypeScript strict mode enabled
- ✅ Drizzle ORM for database operations
- ✅ React functional components with hooks
- ✅ Error handling with proper HTTP status codes

### Compliance Requirements
- ✅ GDPR: User data (ratings) tracked with user IDs
- ✅ HIPAA: Not applicable (no health data)
- ✅ SOC2: Audit logging for admin actions required

## Phase 0: Research

### Full-Text Search Options
1. **PostgreSQL tsvector** (Chosen) - Native, fast, no additional dependencies
2. **Elasticsearch** - Overkill for current scale
3. **Algolia** - SaaS dependency, cost concerns

### Rich Text Editor Options
1. **React Markdown Editor** (Chosen) - Simple, markdown-native
2. **TipTap/ProseMirror** - Heavy, overkill for needs
3. **Monaco Editor** - Code-focused, not ideal for docs

## Phase 1: Design Artifacts

### Data Model

**Entity: HelpArticle**
```typescript
interface HelpArticle {
  id: string;                    // UUID
  category: HelpCategory;        // 'cli' | 'ui' | 'api' | 'guide' | 'faq' | 'troubleshooting' | 'reference'
  subcategory: string;           // e.g., 'database', 'testing'
  title: string;                 // Display title
  slug: string;                  // URL-friendly unique ID
  description: string;           // Short summary
  content: string;               // Markdown content
  contentType: 'markdown' | 'html' | 'text';
  
  // CLI-specific (optional)
  command?: string;              // Full command
  commandAlias?: string;         // Short alias
  usage?: string;                // Usage pattern
  arguments?: Argument[];        // JSON array
  options?: Option[];            // JSON array
  examples?: string[];           // JSON array
  
  // Metadata
  tags: string[];                // Searchable tags
  relatedTopics: string[];       // Related article IDs
  prerequisites: string[];         // Prerequisite knowledge
  
  // Versioning
  version: string;                 // Semver
  minAppVersion?: string;         // Minimum wxKanban version
  maxAppVersion?: string;         // Maximum version (for deprecated)
  
  // Status
  status: 'active' | 'draft' | 'deprecated' | 'archived';
  visibility: 'public' | 'internal' | 'admin';
  
  // Engagement
  viewCount: number;
  helpfulCount: number;
  notHelpfulCount: number;
  
  // Search
  searchKeywords: string;
  isSearchable: boolean;
  
  // Audit
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  deprecatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
  reviewedBy?: string;
}
```

### API Contracts

**Public Endpoints:**

```
GET /api/help/search
Query: q, category, subcategory, limit, offset
Response: {
  articles: HelpArticle[],
  total: number,
  page: number,
  hasMore: boolean
}

GET /api/help/articles/:slug
Response: HelpArticle (increments viewCount)

GET /api/help/categories
Response: {
  categories: [
    { name: string, subcategories: string[], count: number }
  ]
}

GET /api/help/related/:slug
Response: HelpArticle[]

GET /api/help/cli-commands
Query: category
Response: HelpArticle[] (filtered to CLI category)

POST /api/help/:id/rate
Body: { helpful: boolean, feedback?: string }
Response: { success: true }
```

**Admin Endpoints:**

```
GET /api/admin/help/articles
Query: status, visibility, category, author, page, limit
Response: { articles: HelpArticle[], total: number }

POST /api/admin/help/articles
Body: HelpArticle (without id, counts, timestamps)
Response: { id: string }

PUT /api/admin/help/articles/:id
Body: Partial<HelpArticle>
Response: { success: true }

DELETE /api/admin/help/articles/:id
Response: { success: true } (soft delete - marks archived)

POST /api/admin/help/import
Body: { files: { filename: string, content: string }[] }
Response: { imported: number, errors: string[] }

GET /api/admin/help/analytics
Query: startDate, endDate
Response: {
  views: { date: string, count: number }[],
  ratings: { helpful: number, notHelpful: number },
  topArticles: { slug: string, title: string, views: number }[],
  searchQueries: { query: string, count: number }[]
}
```

### Component Architecture

```
Help System Module
├── Public Components
│   ├── HelpPanel (slide-out drawer)
│   ├── HelpSearch (search input + results)
│   ├── HelpArticle (article display)
│   ├── HelpArticleCard (preview card)
│   ├── HelpCategoryList (category navigation)
│   ├── CLIDocumentation (CLI-specific display)
│   ├── ContextualHelp (context-aware button)
│   └── HelpRating (thumbs up/down)
│
├── Admin Components
│   ├── ArticleEditor (markdown editor)
│   ├── ArticleList (data table with filters)
│   ├── ImportTool (file upload + preview)
│   └── AnalyticsDashboard (charts + stats)
│
├── Hooks
│   ├── useHelpSearch (search with debounce)
│   ├── useHelpArticle (fetch + cache)
│   ├── useCategories (category tree)
│   ├── useRateArticle (mutation)
│   └── useAnalytics (admin stats)
│
└── Utils
    ├── search.ts (full-text search logic)
    ├── slugify.ts (URL-friendly slugs)
    └── markdown.ts (rendering helpers)
```

## Quickstart

### For Users
1. Click the help icon (?) in the top navigation
2. Search for topics using the search bar
3. Browse categories on the left
4. Rate articles with thumbs up/down

### For Developers
```bash
# Access CLI help
npx tsx cli/help.ts search "database"

# Import new documentation
npx tsx cli/import-help.ts --source docs.md --category guide
```

### For Admins
1. Navigate to Admin → Help Management
2. Click "New Article" to create content
3. Use the markdown editor with live preview
4. Publish when ready (or save as draft)
5. View analytics to see popular articles

## Implementation Phases

### Phase 1: Core API (Day 1)
- [ ] Create help routes file
- [ ] Implement search endpoint with tsvector
- [ ] Implement article CRUD endpoints
- [ ] Add rating endpoint
- [ ] Write API tests

### Phase 2: Public UI (Day 2)
- [ ] Create HelpPanel component
- [ ] Implement HelpSearch with debounce
- [ ] Build HelpArticle display
- [ ] Add ContextualHelp button to pages
- [ ] Implement rating UI

### Phase 3: Admin UI (Day 3)
- [ ] Create ArticleEditor with markdown
- [ ] Build ArticleList with filters
- [ ] Implement ImportTool
- [ ] Create AnalyticsDashboard
- [ ] Add admin navigation

### Phase 4: Polish (Day 4)
- [ ] Add loading states
- [ ] Implement error handling
- [ ] Add animations for panel
- [ ] Mobile responsiveness
- [ ] E2E tests

## Testing Strategy

### Unit Tests
- Search algorithm ranking
- Slug generation
- Markdown rendering
- Rating calculations

### Integration Tests
- API endpoints
- Database queries
- File import

### E2E Tests
- User search flow
- Article viewing
- Rating submission
- Admin CRUD operations

## Performance Targets

- Search response: < 500ms
- Article load: < 200ms
- Initial bundle: < 100KB for help components

## Security Considerations

- Rate limiting on search endpoint
- Admin-only access to management endpoints
- XSS protection for markdown content
- SQL injection prevention (parameterized queries)

## Deployment Notes

- Database migration already applied
- No additional infrastructure needed
- Can be deployed incrementally (API first, then UI)
