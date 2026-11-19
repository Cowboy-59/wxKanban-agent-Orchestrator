/**
 * Bugfix — project.list_open_items payload + filters.
 *
 * The tool used to inline every document's full markdown body, so a project
 * with ~30 specs (≈90 docs) blew past Claude Code's single-tool-result token
 * limit (~119K chars observed). The fix drops full bodies (returns bodyChars +
 * preview) and adds two optional narrowing filters:
 *   - `status`: restrict tasks to a set of statuses (omit = all statuses, so the
 *     dbpush idempotency read still sees DONE tasks — see wxkanban-agent/dbpush.ts).
 *   - `since`:  return only events at/after an ISO 8601 instant (events are the
 *     one collection that grows without bound over a project's lifetime).
 *
 * These tests lock the input contract of those additions. The schema is shared
 * with project.cockpit_summary, which ignores the two new optional fields.
 */
import { describe, it, expect } from 'vitest';
import { ListOpenItemsInputSchema } from '../src/utils/schemas.js';

const PROJECT_ID = '11111111-1111-1111-1111-111111111111';

describe('ListOpenItemsInputSchema — backward compatibility', () => {
  it('accepts the pre-existing minimal shape ({ projectId } only)', () => {
    const parsed = ListOpenItemsInputSchema.parse({ projectId: PROJECT_ID });
    expect(parsed.projectId).toBe(PROJECT_ID);
    expect(parsed.status).toBeUndefined();
    expect(parsed.since).toBeUndefined();
  });

  it('still enforces a uuid projectId', () => {
    expect(() => ListOpenItemsInputSchema.parse({ projectId: 'not-a-uuid' })).toThrow();
  });

  it('keeps the maxItems bounds (1..100)', () => {
    expect(ListOpenItemsInputSchema.parse({ projectId: PROJECT_ID, maxItems: 100 }).maxItems).toBe(100);
    expect(() => ListOpenItemsInputSchema.parse({ projectId: PROJECT_ID, maxItems: 0 })).toThrow();
    expect(() => ListOpenItemsInputSchema.parse({ projectId: PROJECT_ID, maxItems: 101 })).toThrow();
  });
});

describe('ListOpenItemsInputSchema — status filter', () => {
  it('accepts a non-empty array of statuses', () => {
    const parsed = ListOpenItemsInputSchema.parse({
      projectId: PROJECT_ID,
      status: ['open', 'in-progress'],
    });
    expect(parsed.status).toEqual(['open', 'in-progress']);
  });

  it('rejects an empty status array (a filter that matches nothing is a caller mistake)', () => {
    expect(() => ListOpenItemsInputSchema.parse({ projectId: PROJECT_ID, status: [] })).toThrow();
  });

  it('rejects an empty-string status entry', () => {
    expect(() => ListOpenItemsInputSchema.parse({ projectId: PROJECT_ID, status: [''] })).toThrow();
  });
});

describe('ListOpenItemsInputSchema — since filter', () => {
  it('accepts an ISO 8601 timestamp', () => {
    const ts = '2026-07-14T12:00:00.000Z';
    expect(ListOpenItemsInputSchema.parse({ projectId: PROJECT_ID, since: ts }).since).toBe(ts);
  });

  it('rejects a non-ISO date string', () => {
    expect(() => ListOpenItemsInputSchema.parse({ projectId: PROJECT_ID, since: '2026-07-14' })).toThrow();
    expect(() => ListOpenItemsInputSchema.parse({ projectId: PROJECT_ID, since: 'yesterday' })).toThrow();
  });
});
