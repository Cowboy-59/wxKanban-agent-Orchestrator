# Spec Review Checklist - Week 1 Implementation
## Key Decisions for Your Sign-Off

---

## STREAM A: THEME SYSTEM

### Decision 1: Theme Storage
**What**: Use localStorage + React Context

**Details:**
- `localStorage` key: `'wxkanban-theme-preference'`
- Values: `'light'` or `'dark'`
- No database changes needed
- Persists across sessions and browser restarts

**Alternative Considered**: Server-side preference (would require database changes)

**Question**: ✅ OK with localStorage approach?

---

### Decision 2: Theme Initialization Priority
**What**: Order of preference for initial theme
1. User's stored preference (localStorage)
2. System preference (OS dark mode setting)
3. Default to `'dark'` mode

**Example**:
- First visit: Uses OS preference (dark mode on Mac, light on Windows)
- User toggles to light: Saves to localStorage
- Next visit: Loads localStorage (light) regardless of OS
- Clear localStorage: Reverts to OS preference

**Question**: ✅ Should we default to dark mode, or light mode, or auto-detect?

---

### Decision 3: Theme Application Method
**What**: Apply theme via `data-theme` attribute on `<html>` element

**Details:**
```html
<!-- Light mode -->
<html data-theme="light" style="color-scheme: light;">

<!-- Dark mode -->
<html data-theme="dark" style="color-scheme: dark;">
```

**CSS Integration** (in Tailwind):
```css
html[data-theme="dark"] {
  /* dark mode styles */
}

html[data-theme="light"] {
  /* light mode styles */
}
```

**Alternative**: `<html class="dark">` (Tailwind's default)

**Question**: ✅ OK with `data-theme` attribute instead of CSS class?

---

### Decision 4: Theme Scope
**What**: Apply theme to ALL public pages (landing, login, registration, verification, dashboard)

**Implementation**: Wrap entire `<App>` in `<ThemeProvider>` at top level

**Question**: ✅ Should authenticated dashboard also have theme toggle, or only public pages?

---

---

## STREAM B: REGISTRATION ENHANCEMENTS

### Decision 5: Email Verification Token Storage
**What**: Store hashed token in database (NOT plain JWT)

**Details:**
```typescript
// Generate token
const token = jwt.sign(...) // Plain JWT, sent to user in email link

// Hash for storage (security - prevents token leakage from DB breach)
const tokenHash = sha256(token)

// Store in database
emailVerificationTokens { tokenHash, expiresAt, userId }
```

**Security Benefit**: If database is compromised, attacker can't use tokens (only has hashes)

**Question**: ✅ OK with this approach, or should we use simpler UUID tokens?

---

### Decision 6: Email Verification Endpoint Flow
**What**: Two endpoints
1. `POST /api/auth/send-verification-email` - Send email
2. `GET /api/auth/verify-email?token=X` - Verify token

**Flow**:
```
User registers
  → Backend generates JWT token
  → Hash token, store in DB with 24hr expiry
  → Send email with verification link: /verify-email?token=JWT
  → User clicks email link
  → Backend: Decode JWT, verify signature, check hash matches, mark user verified
```

**Question**: ✅ Does this flow make sense? Any issues?

---

### Decision 7: Tier Pre-Selection Implementation
**What**: Support `?tier=CONSULTANT` query parameter on `/registration` route

**Details**:
- Landing page button: `<a href="/registration?tier=CONSULTANT">Register</a>`
- Registration endpoint: `POST /api/auth/register?tier=CONSULTANT`
- Validation: Only allows `FREE|CONSULTANT|ENTERPRISE`
- Default: Falls back to `FREE` if not provided

**Question**: ✅ Should tier parameter also be passed in request body, or just query string?

---

### Decision 8: Email Verification Timing
**What**: Email sent automatically after registration (before dashboard access)

**Flow**:
```
1. User completes registration
2. Backend sends verification email
3. User cannot login/access dashboard until email verified
4. Verification link valid for 24 hours
5. User can request new link if lost
```

**Question**: ✅ Should users be able to access SOME parts of dashboard before verification (read-only), or completely blocked?

---

### Decision 9: Database Schema for Email Verification
**What**: New table `emailverificationtokens`

```typescript
{
  id: UUID (primary key)
  userId: UUID (foreign key to userprofile.id)
  tokenHash: TEXT (hashed JWT)
  expiresAt: TIMESTAMP (24 hours from creation)
  createdAt: TIMESTAMP (when token was created)
}
```

**Question**: ✅ Should we also track "attempts" to prevent brute force? (e.g., max 5 verification attempts per token)

---

---

## STREAM C: ADMIN DASHBOARD APIs

### Decision 10: Company Service Architecture
**What**: Centralized service class `CompanyService` with static methods

**Details**:
```typescript
// Usage in routes
const company = await CompanyService.getCompanyById(companyId);
const stats = await CompanyService.getCompanyStats(companyId);
const members = await CompanyService.getCompanyTeamMembers(companyId);
```

**Benefits**:
- Single source of truth for company queries
- Easy to test
- Easy to add caching later
- Used across multiple routes

**Alternative**: Inline queries in each route (less maintainable)

**Question**: ✅ OK with this service-based architecture?

---

### Decision 11: User Limit Enforcement by Tier
**What**: Hardcoded limits in `CompanyService`

**Details**:
```typescript
FREE       → 5 users (hard limit)
CONSULTANT → 999 users (practically unlimited)
ENTERPRISE → 999 users (practically unlimited)
```

**Question**: ✅ Should these limits be configurable (environment variables) or hardcoded?

---

### Decision 12: Team Management API Endpoints
**What**: RESTful design with proper HTTP methods

**Endpoints**:
- `GET /api/team` - List members
- `POST /api/team/invite` - Send invitation
- `POST /api/team/:userId/remove` - Remove user
- `PATCH /api/team/:userId/role` - Change role

**Question**: ✅ Should remove endpoint be `POST` (action) or `DELETE` (HTTP standard)?

---

### Decision 13: Invitation Duplicate Prevention
**What**: Check for existing invitations before creating new one

**Behavior**:
```typescript
if (already_invited) {
  return error: "Invitation already sent"
  suggestion: "Resend existing invitation"
}

if (already_in_company) {
  return error: "User already in company"
  suggestion: "Change their role instead"
}
```

**Question**: ✅ Should we auto-generate a new invitation if they invite again, or force explicit resend action?

---

### Decision 14: Last Admin Protection
**What**: Prevent removing the last ADMIN from company

**Behavior**:
```typescript
if (user.role === 'ADMIN' && admin_count === 1) {
  return error: "Cannot remove last ADMIN. Assign another admin first."
}
```

**Question**: ✅ Is this the right protection level? Should we also prevent demoting last admin?

---

### Decision 15: Self-Modification Prevention
**What**: Users cannot modify their own role or remove themselves

**Behavior**:
```typescript
if (targetUserId === currentUserId && action === 'remove') {
  return error: "Cannot remove yourself. Contact another admin."
}

if (targetUserId === currentUserId && action === 'change-role') {
  return error: "Cannot change your own role. Contact another admin."
}
```

**Question**: ✅ OK with preventing self-modification?

---

---

## CROSS-STREAM DECISIONS

### Decision 16: Authentication Middleware
**What**: All `/api/team/*` routes require authentication

**Implementation**:
```typescript
router.use(authMiddleware); // All routes below require valid JWT token
```

**Expects** from middleware:
- `req.user.userId` - Current user ID
- `req.user.companyId` - Current user's company

**Question**: ✅ Should team endpoints also check user is ADMIN, or just authenticated?

---

### Decision 17: Error Handling Pattern
**What**: Consistent error responses across all endpoints

**Pattern**:
```typescript
// Validation error
return res.status(400).json({ error: 'Invalid email' });

// Not found
return res.status(404).json({ error: 'User not found' });

// Unauthorized
return res.status(401).json({ error: 'Not authenticated' });

// Server error
return res.status(500).json({ error: 'Failed to process request' });
```

**Question**: ✅ Should we include error codes (e.g., `{ code: 'USER_NOT_FOUND', error: '...' }`)?

---

### Decision 18: Logging
**What**: Use Pino logger (per CLAUDE.md constitution)

**Pattern**:
```typescript
logger.info({ companyId, userId }, 'Action description');
logger.error({ error, companyId }, 'Error description');
```

**Question**: ✅ What level of detail for logging team actions (invite, remove, role change)?

---

---

## DATABASE SCHEMA REVIEW

### New Table: `emailverificationtokens`

**Schema**:
```typescript
{
  id: UUID (PK)
  userId: UUID (FK)
  tokenHash: TEXT
  expiresAt: TIMESTAMP
  createdAt: TIMESTAMP
}
```

**Naming Convention Check**:
- ✅ Table name: `emailverificationtokens` (plural, lowercase, no underscores)
- ✅ Column names: `userId`, `tokenHash`, etc. (camelCase in TS, lowercase in DB per convention)
- ✅ Foreign keys: `userid` references `userprofile.id`

**Question**: ✅ Does this match your database naming conventions?

---

---

## ACCEPTANCE CRITERIA REVIEW

### Are these the right metrics?

**Stream A (Theme):**
- Theme persists across page reloads ✅
- Theme changes instantly (no page reload) ✅
- Contrast ratios WCAG 2.1 AA ✅
- Mobile touch targets 44px+ ✅

**Stream B (Registration):**
- Email sent within 2 minutes ✅
- Token valid 24 hours ✅
- Cannot login until verified ✅
- Tier pre-selection works end-to-end ✅

**Stream C (Dashboard):**
- Company data fetched correctly ✅
- Duplicate invitation prevention works ✅
- Last admin protected ✅
- All actions logged ✅

**Question**: ✅ Missing any acceptance criteria?

---

---

## QUESTIONS FOR YOU

**Answer these to finalize the spec:**

1. **Theme Default**: Dark mode by default? Or system preference? Or light mode?

2. **Theme Scope**: Include dashboard, or public pages only?

3. **Email Verification**: Block all dashboard access until verified, or partial access?

4. **Tier Parameter**: Query string only, or also in body?

5. **Token Hashing**: Current approach (hash before storage) OK, or use simpler UUID?

6. **Brute Force Protection**: Should we limit verification attempts?

7. **Team Remove**: Use `POST` or `DELETE` method?

8. **Duplicate Invites**: Auto-generate new, or require explicit resend?

9. **Admin Protections**: Also prevent last admin demotion?

10. **Team Endpoints**: Require ADMIN role, or just authenticated user?

11. **Error Codes**: Include error codes in responses?

12. **Logging Level**: What team actions should log (all, or critical only)?

---

## SIGN-OFF

Once you answer the questions above, I can:

✅ **Week 1 Implementation Start** → Write all 8 files with full code
✅ **Run Unit Tests** → Verify each component works
✅ **Integration Testing** → Test flows end-to-end
✅ **Ready for Week 2** → Move to dependent tasks

**Or** → Make changes to spec and re-review

What would you like to do?

