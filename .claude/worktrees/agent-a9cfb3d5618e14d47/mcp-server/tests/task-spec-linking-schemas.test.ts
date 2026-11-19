import { describe, it, expect } from 'vitest';
import {
  LinkTaskToSpecInputSchema,
  UpdateSpecStatusInputSchema,
  CreateTaskInputSchema,
} from '../src/utils/schemas.js';

// [SCOPE 101 / T006] BEGIN — schema guards for task↔spec linking + spec status
// Pure Zod validation (no DB). Locks the mutually-exclusive specId/specNumber
// contract and the lifecycle-status enum so the repair tools can't be called with
// ambiguous or out-of-vocabulary input.
const PROJECT = '11111111-1111-1111-1111-111111111111';
const TASK = '22222222-2222-2222-2222-222222222222';
const SPEC = '33333333-3333-3333-3333-333333333333';

describe('LinkTaskToSpecInputSchema', () => {
  it('accepts a link targeting a spec by specId', () => {
    const r = LinkTaskToSpecInputSchema.safeParse({
      projectId: PROJECT,
      links: [{ taskId: TASK, specId: SPEC }],
    });
    expect(r.success).toBe(true);
  });

  it('accepts a link targeting a spec by specNumber', () => {
    const r = LinkTaskToSpecInputSchema.safeParse({
      projectId: PROJECT,
      links: [{ taskId: TASK, specNumber: '0012' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects a link with BOTH specId and specNumber', () => {
    const r = LinkTaskToSpecInputSchema.safeParse({
      projectId: PROJECT,
      links: [{ taskId: TASK, specId: SPEC, specNumber: '0012' }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects a link with NEITHER specId nor specNumber', () => {
    const r = LinkTaskToSpecInputSchema.safeParse({
      projectId: PROJECT,
      links: [{ taskId: TASK }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects an empty links array', () => {
    const r = LinkTaskToSpecInputSchema.safeParse({ projectId: PROJECT, links: [] });
    expect(r.success).toBe(false);
  });
});

describe('UpdateSpecStatusInputSchema', () => {
  it('accepts specId + a valid lifecycle status', () => {
    const r = UpdateSpecStatusInputSchema.safeParse({
      projectId: PROJECT,
      specId: SPEC,
      status: 'implementing',
    });
    expect(r.success).toBe(true);
  });

  it('accepts specNumber + a valid lifecycle status', () => {
    const r = UpdateSpecStatusInputSchema.safeParse({
      projectId: PROJECT,
      specNumber: '0012',
      status: 'planned',
    });
    expect(r.success).toBe(true);
  });

  it('rejects BOTH specId and specNumber', () => {
    const r = UpdateSpecStatusInputSchema.safeParse({
      projectId: PROJECT,
      specId: SPEC,
      specNumber: '0012',
      status: 'qa',
    });
    expect(r.success).toBe(false);
  });

  it('rejects NEITHER specId nor specNumber', () => {
    const r = UpdateSpecStatusInputSchema.safeParse({ projectId: PROJECT, status: 'qa' });
    expect(r.success).toBe(false);
  });

  it('rejects a status outside the lifecycle vocabulary', () => {
    const r = UpdateSpecStatusInputSchema.safeParse({
      projectId: PROJECT,
      specId: SPEC,
      status: 'tasks_generated',
    });
    expect(r.success).toBe(false);
  });
});

describe('CreateTaskInputSchema specId', () => {
  it('accepts an optional specId (task created already linked)', () => {
    const r = CreateTaskInputSchema.safeParse({
      projectId: PROJECT,
      specId: SPEC,
      title: 'A task',
      descriptionMarkdown: 'body',
    });
    expect(r.success).toBe(true);
  });

  it('still accepts a task with no specId', () => {
    const r = CreateTaskInputSchema.safeParse({
      projectId: PROJECT,
      title: 'A task',
      descriptionMarkdown: 'body',
    });
    expect(r.success).toBe(true);
  });
});
// [SCOPE 101 / T006] END
