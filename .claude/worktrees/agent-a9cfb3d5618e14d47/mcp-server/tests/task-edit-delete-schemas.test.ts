import { describe, it, expect } from 'vitest';
import { UpdateTaskInputSchema, DeleteTaskInputSchema } from '../src/utils/schemas.js';
import { checkPermission } from '../src/auth/role-checker.js';
import type { AuthContext } from '../src/auth/auth-context.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// [SCOPE 101 / T016] BEGIN — schema + permission guards for update_task / delete_task
// Pure validation (no DB). Locks the PATCH contract (at least one field, nulls
// clear), keeps status/specId off the edit path, and pins delete_task to
// editor+admin — the decision taken 2026-09-25 (SCOPE-101 Amendment B).
const TASK = '22222222-2222-2222-2222-222222222222';
const USER = '44444444-4444-4444-4444-444444444444';

describe('UpdateTaskInputSchema', () => {
  it('rejects an empty patch', () => {
    const r = UpdateTaskInputSchema.safeParse({ taskId: TASK });
    expect(r.success).toBe(false);
  });

  it('accepts a description-only patch (the reported case)', () => {
    const r = UpdateTaskInputSchema.safeParse({
      taskId: TASK,
      descriptionMarkdown: 'See SCOPE-002 FR-013 (was 007 FR-017).',
    });
    expect(r.success).toBe(true);
  });

  it('accepts null to clear dueDate and assignedToId', () => {
    const r = UpdateTaskInputSchema.safeParse({ taskId: TASK, dueDate: null, assignedToId: null });
    expect(r.success).toBe(true);
  });

  it('accepts a plain date and an ISO datetime for dueDate', () => {
    expect(UpdateTaskInputSchema.safeParse({ taskId: TASK, dueDate: '2026-10-01' }).success).toBe(true);
    expect(UpdateTaskInputSchema.safeParse({ taskId: TASK, dueDate: '2026-10-01T12:00:00Z' }).success).toBe(true);
  });

  it('rejects a malformed dueDate', () => {
    expect(UpdateTaskInputSchema.safeParse({ taskId: TASK, dueDate: '10/01/2026' }).success).toBe(false);
  });

  it('rejects a non-UUID assignedToId', () => {
    expect(UpdateTaskInputSchema.safeParse({ taskId: TASK, assignedToId: 'andy' }).success).toBe(false);
    expect(UpdateTaskInputSchema.safeParse({ taskId: TASK, assignedToId: USER }).success).toBe(true);
  });

  it('rejects an out-of-vocabulary priority', () => {
    expect(UpdateTaskInputSchema.safeParse({ taskId: TASK, priority: 'urgent' }).success).toBe(false);
  });

  it('does not carry status or specId — those have their own tools', () => {
    const r = UpdateTaskInputSchema.safeParse({ taskId: TASK, title: 'x', status: 'done', specId: USER });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty('status');
      expect(r.data).not.toHaveProperty('specId');
    }
  });

  it('a status-only call is an empty patch, not a status change', () => {
    expect(UpdateTaskInputSchema.safeParse({ taskId: TASK, status: 'done' }).success).toBe(false);
  });
});

describe('DeleteTaskInputSchema', () => {
  it('requires a UUID taskId', () => {
    expect(DeleteTaskInputSchema.safeParse({ taskId: TASK }).success).toBe(true);
    expect(DeleteTaskInputSchema.safeParse({ taskId: 'T001' }).success).toBe(false);
    expect(DeleteTaskInputSchema.safeParse({}).success).toBe(false);
  });
});

const TOOLS = ['project.update_task', 'project.delete_task'];
const as = (role: string) => ({ role }) as unknown as AuthContext;

describe('permissions', () => {
  it.each(TOOLS)('%s allows editor and admin', (tool) => {
    expect(() => checkPermission(tool, as('editor'))).not.toThrow();
    expect(() => checkPermission(tool, as('admin'))).not.toThrow();
  });

  it.each(TOOLS)('%s refuses read_only', (tool) => {
    expect(() => checkPermission(tool, as('read_only'))).toThrow(/not authorized/);
  });
});

// A tool advertised without a matrix entry answers "Unknown tool" at call time;
// one in the matrix but not advertised is invisible to clients. Both halves.
describe('registration', () => {
  const serverSource = readFileSync(join(__dirname, '..', 'src/server.ts'), 'utf8');
  it.each(TOOLS)('%s is advertised and handled', (tool) => {
    expect(serverSource).toContain(`name: '${tool}'`);
    expect(serverSource).toContain(`case '${tool}':`);
  });
});
// [SCOPE 101 / T016] END
