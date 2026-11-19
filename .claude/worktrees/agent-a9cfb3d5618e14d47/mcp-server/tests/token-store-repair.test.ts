/**
 * Token store repair, 2026-09-23 — the three tools that queried a dropped table.
 *
 * Migration 0022 (SCOPE-028 Phase 11) retired `apitokens` and made `mcpapitokens` the
 * single store. The application side was migrated then; `mcp-server/src/utils/project-kit.ts`
 * was not. Result: project.create_api_token, list_api_tokens and revoke_api_token threw
 * `42P01 relation "apitokens" does not exist` on EVERY call while still being advertised
 * in tools/list, and validateApiToken swallowed the error and reported every token invalid.
 *
 * Confirmed against production 2026-09-23: `apitokens` is absent, `mcpapitokens` holds the
 * live rows. These guards are structural — there is no test database — and they exist
 * because the defect was invisible for months: the tools were advertised, so the surface
 * looked complete, and nothing exercised them.
 *
 * Comments are stripped before asserting, per SCOPE-124/T017: the comment explaining the
 * repair necessarily names the dropped table.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CreateApiTokenInputSchema } from '../src/utils/schemas';

// [SCOPE 028 / T025] BEGIN — token store repair guards
function executable(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const KIT = executable(
  readFileSync(join(__dirname, '..', 'src', 'utils', 'project-kit.ts'), 'utf8'),
);
const SERVER = executable(readFileSync(join(__dirname, '..', 'src', 'server.ts'), 'utf8'));

describe('token store repair — nothing queries the dropped table', () => {
  it('project-kit.ts names no bare apitokens table', () => {
    // `mcpapitokens` contains the substring, so match the table position specifically:
    // after FROM/INTO/UPDATE, not preceded by "mcp".
    const bare = KIT.match(/\b(?:FROM|INTO|UPDATE)\s+apitokens\b/gi) ?? [];
    expect(bare).toEqual([]);
  });

  it('writes, reads, updates and validates against mcpapitokens', () => {
    expect(KIT).toMatch(/INSERT INTO\s+mcpapitokens/i);
    expect(KIT).toMatch(/FROM\s+mcpapitokens/i);
    expect(KIT).toMatch(/UPDATE\s+mcpapitokens/i);
  });
});

describe('token store repair — the columns the new store requires', () => {
  it('supplies projectid, which is NOT NULL and has no default', () => {
    expect(KIT).toContain('projectid');
    expect(KIT).toMatch(/createApiToken\([\s\S]{0,200}projectId: string/);
  });

  it('supplies name, which is NOT NULL', () => {
    // Falls back to a dated label rather than inserting null and failing at the DB.
    expect(KIT).toMatch(/name\s*=\s*label\s*\|\|/);
  });

  it('maps the old column names onto the new ones', () => {
    expect(KIT).toContain('issuedbyid');
    expect(KIT).toContain('customerid');
  });

  it('records who revoked a token, which the old store could not', () => {
    expect(KIT).toContain('revokedbyid');
  });

  it('honours expiry when validating, which the old query never checked', () => {
    expect(KIT).toMatch(/expiresat IS NULL OR expiresat/i);
  });
});

describe('token store repair — scope comes from the caller, not a placeholder', () => {
  it("drops the 'default-company' placeholder", () => {
    // It was never a uuid, so it could not have satisfied the FK even had the table existed.
    expect(SERVER).not.toContain("'default-company'");
  });

  it('resolves company and project from the calling token', () => {
    expect(SERVER).toContain('scoped.scope.customerId');
    expect(SERVER).toContain('input.projectId || scoped.scope.projectId');
  });

  it('refuses rather than inventing a scope when neither is resolvable', () => {
    expect(SERVER).toContain('!companyId || !tokenProjectId');
  });

  it('registers both tools as project-scoped', () => {
    const set = SERVER.slice(
      SERVER.indexOf('const PROJECT_SCOPED_TOOLS'),
      SERVER.indexOf(']);', SERVER.indexOf('const PROJECT_SCOPED_TOOLS')),
    );
    expect(set).toContain("'project.create_api_token'");
    expect(set).toContain("'project.list_api_tokens'");
  });

  it('accepts an optional projectId on the input schema', () => {
    expect(CreateApiTokenInputSchema.safeParse({}).success).toBe(true);
    expect(
      CreateApiTokenInputSchema.safeParse({
        projectId: '11111111-1111-4111-8111-111111111111',
      }).success,
    ).toBe(true);
    expect(CreateApiTokenInputSchema.safeParse({ projectId: 'nope' }).success).toBe(false);
  });
});

describe('token store repair — a listing does not leak the binding', () => {
  it('reports the agent name, never the stored binding value', () => {
    // clientbinding is NAME:<sha256 of the token>. The name is safe to show; the
    // hash half is not, and a listing is not the place to hand it out.
    expect(KIT).toContain('agentName');
    const listing = KIT.slice(KIT.indexOf('export async function listApiTokens'), KIT.indexOf('export async function revokeApiToken'));
    expect(listing).not.toMatch(/clientbinding:\s*t\.clientbinding/);
  });
});
// [SCOPE 028 / T025] END
