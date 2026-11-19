# Tasks: wxKanban Online Help System (Spec 016)

## Phase 1: Core API Implementation

### Setup & Foundation
- [ ] [T016-001] [P1] Create help routes file at `src/server/routes/help.ts`
- [ ] [T016-002] [P1] Create help service at `src/server/services/HelpService.ts`
- [ ] [T016-003] [P1] Add help routes to main router in `src/server/index.ts`
- [ ] [T016-004] [P1] Create help types file at `src/shared/types/help.ts`

### Search & Retrieval
- [ ] [T016-005] [P1] Implement GET /api/help/search with full-text search using tsvector
- [ ] [T016-006] [P1] Implement GET /api/help/articles/:slug endpoint
- [ ] [T016-007] [P1] Implement GET /api/help/categories endpoint
- [ ] [T016-008] [P1] Implement GET /api/help/related/:slug endpoint
- [ ] [T016-009] [P1] Implement GET /api/help/cli-commands endpoint

### Rating System
- [ ] [T016-010] [P2] Implement POST /api/help/:id/rate endpoint
- [ ] [T016-011] [P2] Add rating validation (prevent duplicate ratings per user)
- [ ] [T016-012] [P2] Create rating database queries

### Admin API
- [ ] [T016-013] [P1] Implement GET /api/admin/help/articles with filters
- [ ] [T016-014] [P1] Implement POST /api/admin/help/articles endpoint
- [ ] [T016-015] [P1] Implement PUT /api/admin/help/articles/:id endpoint
- [ ] [T016-016] [P1] Implement DELETE /api/admin/help/articles/:id (soft delete)
- [ ] [T016-017] [P2] Implement POST /api/admin/help/import endpoint
- [ ] [T016-018] [P2] Implement GET /api/admin/help/analytics endpoint

### API Testing
- [ ] [T016-019] [P1] Write unit tests for search algorithm
- [ ] [T016-020] [P1] Write integration tests for all public endpoints
- [ ] [T016-021] [P2] Write integration tests for admin endpoints

## Phase 2: Public UI Components

### Core Components
- [ ] [T016-022] [P1] Create HelpPanel slide-out component at `src/client/components/help/HelpPanel.tsx`
- [ ] [T016-023] [P1] Create HelpSearch component with debounced search
- [ ] [T016-024] [P1] Create HelpArticle component for article display
- [ ] [T016-025] [P1] Create HelpArticleCard component for search results
- [ ] [T016-026] [P1] Create HelpCategoryList component for navigation
- [ ] [T016-027] [P1] Create CLIDocumentation component for CLI commands
- [ ] [T016-028] [P1] Create ContextualHelp button component
- [ ] [T016-029] [P1] Create HelpRating component (thumbs up/down)

### Hooks & State
- [ ] [T016-030] [P1] Create useHelpSearch hook with React Query
- [ ] [T016-031] [P1] Create useHelpArticle hook for article fetching
- [ ] [T016-032] [P1] Create useCategories hook for category tree
- [ ] [T016-033] [P1] Create useRateArticle mutation hook
- [ ] [T016-034] [P2] Create useRelatedArticles hook

### Pages
- [ ] [T016-035] [P1] Create HelpPage at `src/client/pages/HelpPage.tsx`
- [ ] [T016-036] [P1] Create HelpArticlePage at `src/client/pages/HelpArticlePage.tsx`
- [ ] [T016-037] [P2] Create HelpSearchResults page

### Integration
- [ ] [T016-038] [P1] Add ContextualHelp button to main navigation
- [ ] [T016-039] [P1] Add help routes to client router
- [ ] [T016-040] [P2] Implement keyboard shortcut (?) to open help

## Phase 3: Admin UI Components

### Admin Components
- [ ] [T016-041] [P1] Create ArticleEditor component with markdown support
- [ ] [T016-042] [P1] Create ArticleList component with data table
- [ ] [T016-043] [P1] Create ArticleFilters component for admin filtering
- [ ] [T016-044] [P2] Create ImportTool component for markdown import
- [ ] [T016-045] [P2] Create AnalyticsDashboard component with charts
- [ ] [T016-046] [P2] Create HelpAdminLayout component

### Admin Hooks
- [ ] [T016-047] [P1] Create useAdminArticles hook with pagination
- [ ] [T016-048] [P1] Create useCreateArticle mutation
- [ ] [T016-049] [P1] Create useUpdateArticle mutation
- [ ] [T016-050] [P1] Create useDeleteArticle mutation
- [ ] [T016-051] [P2] Create useImportArticles hook
- [ ] [T016-052] [P2] Create useAnalytics hook

### Admin Pages
- [ ] [T016-053] [P1] Create AdminHelpPage at `src/client/pages/AdminHelpPage.tsx`
- [ ] [T016-054] [P1] Create AdminArticleEditPage for creating/editing
- [ ] [T016-055] [P2] Create AdminAnalyticsPage

### Admin Navigation
- [ ] [T016-056] [P1] Add Help Management to admin sidebar
- [ ] [T016-057] [P1] Protect admin routes with role-based access

## Phase 4: Utilities & Tools

### CLI Tools
- [ ] [T016-058] [P2] Create cli/help.ts for command-line help access
- [ ] [T016-059] [P2] Create cli/import-help.ts for bulk import
- [ ] [T016-060] [P2] Create cli/export-help.ts for export to markdown

### Utilities
- [ ] [T016-061] [P1] Create search.ts utility for full-text search logic
- [ ] [T016-062] [P1] Create slugify.ts utility for URL-friendly slugs
- [ ] [T016-063] [P1] Create markdown.ts for rendering helpers
- [ ] [T016-064] [P2] Create highlight.ts for search term highlighting

## Phase 5: Testing & Polish

### Testing
- [ ] [T016-065] [P1] Write E2E tests for user search flow
- [ ] [T016-066] [P1] Write E2E tests for article viewing
- [ ] [T016-067] [P1] Write E2E tests for rating system
- [ ] [T016-068] [P1] Write E2E tests for admin CRUD operations
- [ ] [T016-069] [P2] Add performance tests for search endpoint

### UI Polish
- [ ] [T016-070] [P2] Add loading skeletons for all components
- [ ] [T016-071] [P2] Implement error boundaries for help components
- [ ] [T016-072] [P2] Add animations for HelpPanel slide-in
- [ ] [T016-073] [P2] Implement mobile-responsive design
- [ ] [T016-074] [P2] Add empty states for no results

### Documentation
- [ ] [T016-075] [P2] Update API documentation
- [ ] [T016-076] [P2] Create help system user guide
- [ ] [T016-077] [P2] Document admin workflows

## Dependencies

### Phase 1 Dependencies
- Database schema already exists (wxkanbanhelp table)
- Drizzle ORM configured
- Express server running

### Phase 2 Dependencies
- Phase 1 API complete
- React Query configured
- UI component library available

### Phase 3 Dependencies
- Phase 2 public UI complete
- Admin authentication system
- Role-based access control

### Phase 4 Dependencies
- Phase 1 API complete
- Node.js CLI environment

### Phase 5 Dependencies
- All previous phases complete
- Playwright E2E setup
- Test database available

## Parallel Execution Opportunities

1. **Frontend & Backend Parallel**: UI components can be built with mock data while API is being developed
2. **Admin & Public Parallel**: Admin and public interfaces can be developed simultaneously
3. **Testing Parallel**: Unit tests can be written alongside component development

## Suggested MVP

**Core MVP (Days 1-2):**
- Public search API
- HelpPanel with search
- Article viewing
- Basic admin CRUD

**Full Feature (Days 3-4):**
- Rating system
- Analytics
- Import/Export tools
- Mobile responsiveness

## Task Completion Tracking

| Phase | Total | Complete | Progress |
|-------|-------|----------|----------|
| Phase 1: API | 21 | 0 | 0% |
| Phase 2: Public UI | 18 | 0 | 0% |
| Phase 3: Admin UI | 17 | 0 | 0% |
| Phase 4: Utilities | 7 | 0 | 0% |
| Phase 5: Testing | 13 | 0 | 0% |
| **Total** | **76** | **0** | **0%** |
