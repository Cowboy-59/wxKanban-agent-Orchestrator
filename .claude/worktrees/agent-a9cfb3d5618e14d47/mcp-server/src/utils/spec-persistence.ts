// [SCOPE 124 / T008] BEGIN — identity rules for idempotent spec persistence
/**
 * SCOPE-124 / FR-005 — every write path is idempotent.
 *
 * `create_specs` inserted a new document row and a new task row on every call, so a spec that was
 * pushed twice grew a parallel set instead of being updated (975ada4a). When this was written
 * production held 115 excess document rows across 83 (project, title, doctype) groups — six copies
 * each of one scope's spec, plan and lifecycle documents.
 *
 * The decisions that make a write idempotent are pure functions of what is already there and what
 * is arriving, so they live here where they can be tested. The handler keeps only the plumbing.
 *
 * **The document titles below are a cross-writer contract, not cosmetics.** `dbpush`'s
 * `pushExistingSpec` upserts these same rows through `project.upsert_document`, which matches
 * project-level documents by `(doctype, title)` with `specId IS NULL`. If the two writers disagree
 * about a title by so much as an em-dash, each builds its own parallel set — which is exactly what
 * BUG-2026-07-18 was. Change a title here only together with the kit.
 */

export interface SpecDocumentSpec {
  /** Match key, with doctype. Must equal what dbpush sends to upsert_document. */
  title: string;
  doctype: string;
  content: string;
  tags: string[];
  /** Label for the response envelope only — never part of the identity. */
  kind: 'spec' | 'plan' | 'lifecycle';
}

export interface TaskLike {
  name: string;
}

export interface IncomingTask {
  title: string;
  description?: string;
  priority?: string;
  status?: string;
}

export interface TaskPartition<TExisting extends TaskLike> {
  /** Incoming tasks that already have a row under this spec, paired with it. */
  updates: Array<{ existing: TExisting; incoming: IncomingTask }>;
  /** Incoming tasks with no row yet. */
  creates: IncomingTask[];
  /**
   * Incoming titles that appeared more than once in the same push. Only the first is acted on —
   * a duplicated title in tasks.md must not become two rows, which would recreate the defect
   * from inside a single call.
   */
  duplicateTitles: string[];
}

/** The plan document's body. Kept here so the content and its title travel together. */
export function buildPlanContent(specNumber: string, featureName: string): string {
  return `# Implementation Plan: ${featureName}\n\n## Overview\nSpec ${specNumber} implementation plan.\n\n## Phases\n1. Design\n2. Implementation\n3. QA Testing\n4. Human Testing\n5. Beta Release\n6. Released\n\n## Tasks\nSee generated tasks below.`;
}

/** The spec document's title — `Spec {N}: {name}`. Matched verbatim by dbpush. */
export function specDocumentTitle(specNumber: string, featureName: string): string {
  return `Spec ${specNumber}: ${featureName}`;
}

/** The plan document's title — `Plan: {name}`. Matched verbatim by dbpush. */
export function planDocumentTitle(featureName: string): string {
  return `Plan: ${featureName}`;
}

/** The lifecycle document's title. dbpush does not write this one; create_specs owns it. */
export function lifecycleDocumentTitle(featureName: string): string {
  return `Lifecycle: ${featureName}`;
}

/**
 * Every document `create_specs` writes for a spec, with the identity each one is matched on.
 * `lifecycleContent` is omitted when the caller did not ask for lifecycle generation.
 */
export function specDocumentSet(input: {
  specNumber: string;
  featureName: string;
  phase: string;
  scopeContent: string;
  lifecycleContent?: string;
}): SpecDocumentSpec[] {
  const docs: SpecDocumentSpec[] = [
    {
      title: specDocumentTitle(input.specNumber, input.featureName),
      doctype: 'specs',
      content: input.scopeContent,
      tags: ['spec', input.specNumber, input.phase],
      kind: 'spec',
    },
    {
      title: planDocumentTitle(input.featureName),
      doctype: 'specs',
      content: buildPlanContent(input.specNumber, input.featureName),
      tags: ['plan', input.specNumber],
      kind: 'plan',
    },
  ];

  if (input.lifecycleContent !== undefined) {
    docs.push({
      title: lifecycleDocumentTitle(input.featureName),
      doctype: 'lifecycle',
      content: input.lifecycleContent,
      tags: ['lifecycle', input.specNumber],
      kind: 'lifecycle',
    });
  }

  return docs;
}

/**
 * Split incoming tasks into those that already exist under this spec and those that do not.
 *
 * A task's identity is `(specId, name)`. Name is a weaker key than a UUID, but it is the only key
 * the caller has — tasks arrive from a markdown file with no stable id — and it is the same key
 * `dbpush`'s status sync already matches on. Matching is exact: trimming or case-folding would
 * silently merge two tasks a caller deliberately kept distinct.
 */
export function partitionTasksByName<TExisting extends TaskLike>(
  existing: TExisting[],
  incoming: IncomingTask[],
): TaskPartition<TExisting> {
  const byName = new Map<string, TExisting>();
  for (const row of existing) {
    if (!byName.has(row.name)) {
      byName.set(row.name, row);
    }
  }

  const updates: Array<{ existing: TExisting; incoming: IncomingTask }> = [];
  const creates: IncomingTask[] = [];
  const duplicateTitles: string[] = [];
  const seen = new Set<string>();

  for (const task of incoming) {
    if (seen.has(task.title)) {
      duplicateTitles.push(task.title);
      continue;
    }
    seen.add(task.title);

    const match = byName.get(task.title);
    if (match) {
      updates.push({ existing: match, incoming: task });
    } else {
      creates.push(task);
    }
  }

  return { updates, creates, duplicateTitles };
}
// [SCOPE 124 / T008] END

export interface SpecTargetRow {
  id: string;
  specNumber: string;
  title: string;
  status: string;
}

export interface SpecTargetResolution<TRow extends SpecTargetRow> {
  spec: TRow;
  resolvedBy: 'specId' | 'exact' | 'normalized';
}

// [SCOPE 124 / T022] BEGIN — a spec write says which record it hit
export class SpecTargetAmbiguousError extends Error {
  constructor(
    public readonly requestedSpecNumber: string,
    public readonly candidates: SpecTargetRow[],
  ) {
    super(
      `Spec number "${requestedSpecNumber}" matches ${candidates.length} specs in this project once leading zeros are ignored: ` +
        candidates.map((c) => `"${c.specNumber}" (${c.title}, ${c.status}, id ${c.id})`).join('; ') +
        '. Re-issue with specId to name the one you mean.',
    );
    this.name = 'SpecTargetAmbiguousError';
  }
}
// [SCOPE 124 / T022] END

// [SCOPE 124 / T022] BEGIN — a spec write says which record it hit
export class SpecTargetNotFoundError extends Error {
  constructor(public readonly requested: string) {
    super(`Spec not found in this project: ${requested}`);
    this.name = 'SpecTargetNotFoundError';
  }
}
// [SCOPE 124 / T022] END

// [SCOPE 124 / T022] BEGIN — a spec write says which record it hit
export function resolveSpecTarget<TRow extends SpecTargetRow>(
  specs: TRow[],
  target: { specId?: string; specNumber?: string },
// [SCOPE 124 / T022] END
): SpecTargetResolution<TRow> {
  if (target.specId) {
    const byId = specs.find((s) => s.id === target.specId);
    if (!byId) throw new SpecTargetNotFoundError(target.specId);
    return { spec: byId, resolvedBy: 'specId' };
  }

  const requested = target.specNumber;
  if (requested === undefined || requested === null || String(requested).trim() === '') {
    throw new SpecTargetNotFoundError(String(requested));
  }

  const wanted = String(requested).trim();

  const exact = specs.filter((s) => String(s.specNumber) === wanted);
  if (exact.length === 1) return { spec: exact[0], resolvedBy: 'exact' };
  if (exact.length > 1) throw new SpecTargetAmbiguousError(wanted, exact);

  const wantedNumber = Number(wanted);
  if (!Number.isFinite(wantedNumber)) throw new SpecTargetNotFoundError(wanted);

  const normalized = specs.filter((s) => {
    const n = Number(s.specNumber);
    return Number.isFinite(n) && n === wantedNumber;
  });
  if (normalized.length === 0) throw new SpecTargetNotFoundError(wanted);
  if (normalized.length > 1) throw new SpecTargetAmbiguousError(wanted, normalized);

  return { spec: normalized[0], resolvedBy: 'normalized' };
}
