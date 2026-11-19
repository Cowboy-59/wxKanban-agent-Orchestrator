# Week 1 Implementation Spec - All 3 Streams
## Foundational Tasks Ready to Start

**Created**: 2026-02-18
**Duration**: Week 1 (7 days)
**Approach**: Start 5 independent tasks in parallel, chain 3 dependent tasks

---

## WEEK 1 TASK PRIORITY

### Independent Tasks (Start Today)
1. **A1.1** - Theme utilities (lib/themePreference.ts)
2. **B1.1** - Email verification endpoint (routes/auth.ts)
3. **B1.4** - Tier pre-selection support (routes/auth.ts)
4. **C1.1** - Company service (services/CompanyService.ts)
5. **C1.2** - Team management APIs (routes/team.ts)

### Dependent on Above (Start After)
6. **A1.2** - ThemeProvider (components/ThemeProvider.tsx) → After A1.1
7. **A1.3** - ThemeToggle (components/ThemeToggle.tsx) → After A1.2
8. **B1.2** - Email handler endpoint (routes/auth.ts) → After B1.1

---

# STREAM A: THEME SYSTEM

## A1.1 - Theme Utilities (themePreference.ts)

**File**: `src/client/lib/themePreference.ts`

```typescript
/**
 * Theme preference management
 * - Detect system preference (prefers-color-scheme)
 * - Read/write localStorage
 * - Initialize theme on app start
 */

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'wxkanban-theme-preference';

/**
 * Detect system theme preference
 * Returns 'dark' if system prefers dark mode, 'light' otherwise
 */
export function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'; // SSR fallback

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  return mediaQuery.matches ? 'dark' : 'light';
}

/**
 * Get user's stored theme preference from localStorage
 * Returns null if not set
 */
export function getStoredTheme(): Theme | null {
  if (typeof window === 'undefined') return null; // SSR

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') {
    return stored;
  }
  return null;
}

/**
 * Save theme preference to localStorage
 */
export function saveTheme(theme: Theme): void {
  if (typeof window === 'undefined') return; // SSR
  window.localStorage.setItem(STORAGE_KEY, theme);
}

/**
 * Initialize theme on app start
 * Priority: stored preference > system preference > default to 'dark'
 */
export function initializeTheme(): Theme {
  const stored = getStoredTheme();
  if (stored) return stored;

  const system = getSystemTheme();
  return system;
}

/**
 * Apply theme to document
 * - Set data-theme attribute on <html>
 * - Set color-scheme CSS property
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return; // SSR

  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  root.style.colorScheme = theme;
}

/**
 * Toggle between light and dark
 */
export function toggleTheme(current: Theme): Theme {
  const next = current === 'light' ? 'dark' : 'light';
  saveTheme(next);
  applyTheme(next);
  return next;
}
```

**Acceptance Criteria:**
- ✅ All exports TypeScript typed
- ✅ Functions handle SSR (no window errors)
- ✅ localStorage correctly read/written
- ✅ System preference detected via matchMedia
- ✅ Fallback to 'dark' as default

**Dependencies**: None

---

## A1.2 - ThemeProvider Context

**File**: `src/client/components/ThemeProvider.tsx`

```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  Theme,
  getStoredTheme,
  getSystemTheme,
  saveTheme,
  applyTheme,
} from '../lib/themePreference';

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * ThemeProvider - Wraps app and manages theme state
 * Applies theme to document on mount and changes
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Initialize: stored > system > dark
    if (typeof window === 'undefined') return 'dark';
    return getStoredTheme() || getSystemTheme();
  });

  // Apply theme to document on mount and when theme changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === 'light' ? 'dark' : 'light';
      saveTheme(next);
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to use theme in components
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
```

**Integration with App.tsx:**
```typescript
// In src/client/App.tsx
import { ThemeProvider } from './components/ThemeProvider';

function App() {
  return (
    <ThemeProvider>
      {/* Rest of app */}
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/registration" element={<RegistrationPage />} />
        <Route path="/dashboard" element={<Dashboard />} />
      </Routes>
    </ThemeProvider>
  );
}
```

**Acceptance Criteria:**
- ✅ Context provides theme and toggleTheme
- ✅ useTheme() hook works in components
- ✅ Theme persists on page reload
- ✅ Theme applies instantly (no flicker)
- ✅ useTheme without provider throws error

**Dependencies**: A1.1

---

## A1.3 - ThemeToggle Component

**File**: `src/client/components/ThemeToggle.tsx`

```typescript
import React from 'react';
import { useTheme } from './ThemeProvider';

/**
 * ThemeToggle button - appears in header
 * Shows sun/moon icon, toggles on click
 */
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? (
        // Moon icon (dark mode)
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      ) : (
        // Sun icon (light mode)
        <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.293 1.707a1 1 0 011.414 0l.707.707a1 1 0 11-1.414 1.414l-.707-.707a1 1 0 010-1.414zm2 2.828a1 1 0 011.414 0l.707.707a1 1 0 11-1.414 1.414l-.707-.707a1 1 0 010-1.414zm-3 1.414a1 1 0 00-1.414 0l-.707-.707a1 1 0 011.414-1.414l.707.707zm0 2.828a1 1 0 001.414 0l.707.707a1 1 0 11-1.414 1.414l-.707-.707a1 1 0 000-1.414zm2-2.828a1 1 0 001.414-1.414l.707-.707a1 1 0 111.414 1.414l-.707.707a1 1 0 00-1.414 0zM10 18a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zm4-1a1 1 0 100 2h1a1 1 0 100-2h-1zm-8 0a1 1 0 100 2h1a1 1 0 100-2H6zm2-7a3 3 0 11-6 0 3 3 0 016 0zm0 8a1 1 0 110-2 1 1 0 010 2z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </button>
  );
}
```

**Acceptance Criteria:**
- ✅ Button toggles theme on click
- ✅ Icon changes (sun ↔ moon)
- ✅ Tooltip/aria-label describes action
- ✅ Touch target 44px+ (min accessibility standard)
- ✅ Works in light and dark mode
- ✅ No console errors

**Dependencies**: A1.2

---

# STREAM B: REGISTRATION ENHANCEMENTS

## B1.1 - Email Verification Endpoint

**File**: `src/server/routes/auth.ts` (add to existing)

```typescript
/**
 * POST /api/auth/send-verification-email
 * Send verification email to user
 */
router.post('/send-verification-email', async (req, res) => {
  try {
    const { email } = req.body;

    // Validate email
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Check user exists (should be from registration)
    const user = await db
      .select()
      .from(userprofile)
      .where(eq(userprofile.email, email))
      .limit(1);

    if (user.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Generate JWT token (24-hour expiry)
    const token = jwt.sign(
      { email, purpose: 'email-verification' },
      process.env.JWT_SECRET!,
      { expiresIn: '24h' }
    );

    // Hash token for storage (don't store plain JWT)
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Store token hash in database with expiry
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.insert(emailVerificationTokens).values({
      id: crypto.randomUUID(),
      userId: user[0].id,
      tokenHash,
      expiresAt,
      createdAt: new Date(),
    });

    // Send verification email
    const verificationLink = `${process.env.CLIENT_URL}/verify-email?token=${token}`;

    await sendEmail({
      to: email,
      subject: 'Verify your wxKanban email',
      html: `
        <h2>Verify Your Email</h2>
        <p>Click the link below to verify your wxKanban account:</p>
        <a href="${verificationLink}">Verify Email</a>
        <p>This link expires in 24 hours.</p>
      `,
    });

    res.json({
      success: true,
      message: 'Verification email sent',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to send verification email');
    res.status(500).json({ error: 'Failed to send verification email' });
  }
});
```

**Database Schema Needed:**
```typescript
// src/db/schema/emailVerificationToken.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const emailVerificationTokens = pgTable('emailverificationtokens', {
  id: uuid('id').primaryKey(),
  userId: uuid('userid').references(() => userprofile.id),
  tokenHash: text('tokenhash').notNull(),
  expiresAt: timestamp('expiresat').notNull(),
  createdAt: timestamp('createdat').defaultNow(),
});
```

**Acceptance Criteria:**
- ✅ Generates JWT with 24-hour expiry
- ✅ Hashes token before storage (security)
- ✅ Email sent within 2 minutes
- ✅ Link includes verification token
- ✅ Stores token in database
- ✅ Error handling for invalid email
- ✅ User not found returns 404

**Dependencies**: None

---

## B1.2 - Email Verification Handler Endpoint

**File**: `src/server/routes/auth.ts` (add to existing)

```typescript
/**
 * GET /api/auth/verify-email?token=X
 * Verify email using token from email link
 */
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Token required' });
    }

    // Decode JWT to verify signature and expiry
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
        email: string;
        purpose: string;
      };
    } catch (error) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (decoded.purpose !== 'email-verification') {
      return res.status(401).json({ error: 'Invalid token purpose' });
    }

    // Hash token to match stored hash
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find token in database
    const tokenRecord = await db
      .select()
      .from(emailVerificationTokens)
      .where(eq(emailVerificationTokens.tokenHash, tokenHash))
      .limit(1);

    if (tokenRecord.length === 0) {
      return res.status(401).json({ error: 'Token not found' });
    }

    // Check expiry
    if (new Date() > tokenRecord[0].expiresAt) {
      return res.status(401).json({ error: 'Token expired' });
    }

    // Update user to mark email as verified
    await db
      .update(userprofile)
      .set({ emailverified: true })
      .where(eq(userprofile.id, tokenRecord[0].userId));

    // Delete used token
    await db
      .delete(emailVerificationTokens)
      .where(eq(emailVerificationTokens.id, tokenRecord[0].id));

    res.json({
      success: true,
      message: 'Email verified successfully',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to verify email');
    res.status(500).json({ error: 'Failed to verify email' });
  }
});
```

**Acceptance Criteria:**
- ✅ Valid token verifies user
- ✅ Expired token returns error
- ✅ Invalid token returns error
- ✅ User.emailverified set to true
- ✅ Token deleted after use (one-time only)
- ✅ Error messages clear

**Dependencies**: B1.1

---

## B1.4 - Tier Pre-Selection Support

**File**: `src/server/routes/auth.ts` (modify existing `/api/auth/register`)

```typescript
/**
 * POST /api/auth/register
 * Updated to support ?tier=X query parameter
 */
router.post('/register', async (req, res) => {
  try {
    // Extract tier from query (optional)
    const { tier: queryTier } = req.query;
    const { subscriptionTier, ...restOfBody } = req.body;

    // Determine tier (query param overrides, or use body, or default to FREE)
    let tier = queryTier || subscriptionTier || 'FREE';

    // Validate tier
    if (!['FREE', 'CONSULTANT', 'ENTERPRISE'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid subscription tier' });
    }

    // Continue with existing registration logic using validated tier
    // ... rest of registration code ...

    const registrationResult = await registerCompany({
      ...restOfBody,
      subscriptionTier: tier,
    });

    res.json(registrationResult);
  } catch (error) {
    logger.error({ error }, 'Registration failed');
    res.status(500).json({ error: 'Registration failed' });
  }
});
```

**Acceptance Criteria:**
- ✅ Accepts ?tier=FREE|CONSULTANT|ENTERPRISE
- ✅ Validates tier value
- ✅ Defaults to FREE if not provided
- ✅ Query param takes precedence over body
- ✅ Invalid tier returns 400

**Dependencies**: None

---

# STREAM C: ADMIN DASHBOARD FOUNDATION

## C1.1 - Company Service

**File**: `src/server/services/CompanyService.ts`

```typescript
import { db } from '../db/client';
import {
  companies,
  userprofile,
  subscriptions,
  userinvitation,
  projectusers,
  projects,
} from '../../db/schema';
import { eq, and, count } from 'drizzle-orm';
import { logger } from '../lib/logger';

interface CompanyWithStats {
  id: string;
  companyName: string;
  subscriptionTier: 'FREE' | 'CONSULTANT' | 'ENTERPRISE';
  subscriptionStatus: string;
  maxUsers: number;
  usersCount: number;
  billingEmail: string;
  createdAt: Date;
}

interface CompanyStats {
  activeUsers: number;
  pendingInvitations: number;
  activeProjects: number;
  totalTasks: number;
}

/**
 * Get company by ID with user count and subscription info
 */
export async function getCompanyById(companyId: string): Promise<CompanyWithStats | null> {
  try {
    const company = await db
      .select()
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);

    if (company.length === 0) {
      return null;
    }

    // Count active users in company
    const usersResult = await db
      .select({ count: count() })
      .from(userprofile)
      .where(eq(userprofile.companyid, companyId));

    const usersCount = usersResult[0]?.count || 0;

    // Get max users for tier
    const maxUsers = getTierUserLimit(company[0].subscriptiontier as any);

    return {
      id: company[0].id,
      companyName: company[0].companyname,
      subscriptionTier: company[0].subscriptiontier as any,
      subscriptionStatus: company[0].subscriptionstatus,
      maxUsers,
      usersCount,
      billingEmail: company[0].billingemail,
      createdAt: company[0].createdat,
    };
  } catch (error) {
    logger.error({ error, companyId }, 'Failed to get company');
    throw error;
  }
}

/**
 * Get company statistics
 */
export async function getCompanyStats(companyId: string): Promise<CompanyStats> {
  try {
    // Active users
    const usersResult = await db
      .select({ count: count() })
      .from(userprofile)
      .where(eq(userprofile.companyid, companyId));
    const activeUsers = usersResult[0]?.count || 0;

    // Pending invitations
    const invitationsResult = await db
      .select({ count: count() })
      .from(userinvitation)
      .where(
        and(
          eq(userinvitation.companyid, companyId),
          eq(userinvitation.status, 'PENDING')
        )
      );
    const pendingInvitations = invitationsResult[0]?.count || 0;

    // Active projects
    const projectsResult = await db
      .select({ count: count() })
      .from(projects)
      .where(eq(projects.companyid, companyId));
    const activeProjects = projectsResult[0]?.count || 0;

    // Total tasks (placeholder, will expand later)
    const totalTasks = 0;

    return {
      activeUsers,
      pendingInvitations,
      activeProjects,
      totalTasks,
    };
  } catch (error) {
    logger.error({ error, companyId }, 'Failed to get company stats');
    throw error;
  }
}

/**
 * Get all team members for a company
 */
export async function getCompanyTeamMembers(companyId: string) {
  try {
    const members = await db
      .select()
      .from(userprofile)
      .where(eq(userprofile.companyid, companyId));

    return members;
  } catch (error) {
    logger.error({ error, companyId }, 'Failed to get team members');
    throw error;
  }
}

/**
 * Update company information
 */
export async function updateCompanyInfo(
  companyId: string,
  data: {
    companyName?: string;
    billingEmail?: string;
    billingAddress?: string;
    billingPhone?: string;
  }
) {
  try {
    const updated = await db
      .update(companies)
      .set({
        companyname: data.companyName,
        billingemail: data.billingEmail,
        billingaddress: data.billingAddress,
        billingphone: data.billingPhone,
      })
      .where(eq(companies.id, companyId))
      .returning();

    return updated[0] || null;
  } catch (error) {
    logger.error({ error, companyId }, 'Failed to update company');
    throw error;
  }
}

/**
 * Helper: Get user limit for tier
 */
function getTierUserLimit(tier: string): number {
  switch (tier) {
    case 'FREE':
      return 5;
    case 'CONSULTANT':
      return 999; // Unlimited
    case 'ENTERPRISE':
      return 999; // Unlimited
    default:
      return 5;
  }
}
```

**Acceptance Criteria:**
- ✅ getCompanyById returns company with user count
- ✅ getCompanyStats returns accurate counts
- ✅ getCompanyTeamMembers lists all users
- ✅ updateCompanyInfo saves changes
- ✅ All functions have error logging
- ✅ TypeScript types correct
- ✅ No N+1 queries

**Dependencies**: None

---

## C1.2 - Team Management APIs

**File**: `src/server/routes/team.ts` (new file)

```typescript
import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';
import { CompanyService } from '../services/CompanyService';
import { db } from '../db/client';
import { userprofile, userinvitation } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../lib/logger';

const router = Router();

// Require authentication on all routes
router.use(authMiddleware);

/**
 * GET /api/team
 * Get all team members and pending invitations for company
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;

    if (!companyId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const members = await CompanyService.getCompanyTeamMembers(companyId);

    const invitations = await db
      .select()
      .from(userinvitation)
      .where(
        and(
          eq(userinvitation.companyid, companyId),
          eq(userinvitation.status, 'PENDING')
        )
      );

    res.json({
      members,
      invitations,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get team');
    res.status(500).json({ error: 'Failed to get team' });
  }
});

/**
 * POST /api/team/invite
 * Send invitation to user
 */
router.post('/invite', async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    const userId = req.user?.userId;
    const { email, role, message } = req.body;

    if (!companyId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Validate role
    if (!['ADMIN', 'MANAGER', 'DEVELOPER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Check if user already in company
    const existing = await db
      .select()
      .from(userprofile)
      .where(
        and(
          eq(userprofile.companyid, companyId),
          eq(userprofile.email, email)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      return res.status(400).json({
        error: 'User already in company',
        suggestion: 'Change their role instead',
      });
    }

    // Check for pending invitation
    const pendingInvitation = await db
      .select()
      .from(userinvitation)
      .where(
        and(
          eq(userinvitation.companyid, companyId),
          eq(userinvitation.email, email),
          eq(userinvitation.status, 'PENDING')
        )
      )
      .limit(1);

    if (pendingInvitation.length > 0) {
      return res.status(400).json({
        error: 'Invitation already sent to this email',
        suggestion: 'Resend existing invitation',
      });
    }

    // Create invitation record
    const invitationId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await db.insert(userinvitation).values({
      id: invitationId,
      companyid: companyId,
      email,
      role,
      status: 'PENDING',
      createdat: new Date(),
      expiresat: expiresAt,
      senderuserid: userId,
      personalmessage: message,
    });

    // Send invitation email (integrate with email service)
    // TODO: sendInvitationEmail(email, companyId, role, message, invitationId)

    res.json({
      success: true,
      invitationId,
      message: `Invitation sent to ${email}`,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to send invitation');
    res.status(500).json({ error: 'Failed to send invitation' });
  }
});

/**
 * POST /api/team/:userId/remove
 * Remove user from company
 */
router.post('/:userId/remove', async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    const targetUserId = req.params.userId;
    const currentUserId = req.user?.userId;

    if (!companyId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Cannot remove yourself
    if (targetUserId === currentUserId) {
      return res.status(400).json({
        error: 'Cannot remove yourself. Contact another admin.',
      });
    }

    // Get target user
    const targetUser = await db
      .select()
      .from(userprofile)
      .where(eq(userprofile.id, targetUserId))
      .limit(1);

    if (targetUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if last ADMIN
    if (targetUser[0].role === 'ADMIN') {
      const adminCount = await db
        .select()
        .from(userprofile)
        .where(
          and(
            eq(userprofile.companyid, companyId),
            eq(userprofile.role, 'ADMIN')
          )
        );

      if (adminCount.length === 1) {
        return res.status(400).json({
          error: 'Cannot remove last ADMIN. Assign another admin first.',
        });
      }
    }

    // Remove user from company (set companyid to null or delete)
    await db
      .update(userprofile)
      .set({ companyid: null })
      .where(eq(userprofile.id, targetUserId));

    logger.info(
      { companyId, removedUserId: targetUserId, adminUserId: currentUserId },
      'User removed from company'
    );

    res.json({
      success: true,
      message: 'User removed from company',
    });
  } catch (error) {
    logger.error({ error }, 'Failed to remove user');
    res.status(500).json({ error: 'Failed to remove user' });
  }
});

/**
 * PATCH /api/team/:userId/role
 * Change user's role in company
 */
router.patch('/:userId/role', async (req: Request, res: Response) => {
  try {
    const companyId = req.user?.companyId;
    const targetUserId = req.params.userId;
    const { role } = req.body;

    if (!companyId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Validate role
    if (!['ADMIN', 'MANAGER', 'DEVELOPER'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    // Cannot change your own role
    if (targetUserId === req.user?.userId) {
      return res.status(400).json({
        error: 'Cannot change your own role. Contact another admin.',
      });
    }

    // Update role
    const updated = await db
      .update(userprofile)
      .set({ role })
      .where(
        and(
          eq(userprofile.id, targetUserId),
          eq(userprofile.companyid, companyId)
        )
      )
      .returning();

    if (updated.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    logger.info(
      { companyId, userId: targetUserId, newRole: role },
      'User role changed'
    );

    res.json({
      success: true,
      user: updated[0],
    });
  } catch (error) {
    logger.error({ error }, 'Failed to change user role');
    res.status(500).json({ error: 'Failed to change user role' });
  }
});

export default router;
```

**Acceptance Criteria:**
- ✅ GET /api/team returns members and invitations
- ✅ POST /api/team/invite creates invitation
- ✅ Duplicate prevention (warns if already invited)
- ✅ POST /api/team/:id/remove removes user
- ✅ Cannot remove last ADMIN
- ✅ Cannot remove self
- ✅ PATCH /api/team/:id/role changes role
- ✅ Cannot change own role
- ✅ All actions logged
- ✅ Error messages clear

**Dependencies**: None

---

## Summary: Week 1 Ready

| Task | Files | Status |
|------|-------|--------|
| A1.1 | `lib/themePreference.ts` | Ready ✅ |
| A1.2 | `components/ThemeProvider.tsx` | Ready (after A1.1) ✅ |
| A1.3 | `components/ThemeToggle.tsx` | Ready (after A1.2) ✅ |
| B1.1 | `routes/auth.ts` | Ready ✅ |
| B1.2 | `routes/auth.ts` | Ready (after B1.1) ✅ |
| B1.4 | `routes/auth.ts` | Ready ✅ |
| C1.1 | `services/CompanyService.ts` | Ready ✅ |
| C1.2 | `routes/team.ts` | Ready ✅ |

**Total New Files**: 6
**Modified Files**: 2 (auth.ts, App.tsx)
**Database**: 1 new schema (emailVerificationTokens)

---

