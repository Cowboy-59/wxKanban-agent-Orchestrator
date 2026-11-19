// Guard for a break that shipped twice (task_push 2026-05-24,
// spec_implementation_progress 2026-08-20 — and 16 more found alongside it).
//
// Two independent copies of the capture_event type vocabulary drifted apart:
//   1. the kit command docs, which TELL consumers which type to emit, and
//   2. ProjectEventTypeSchema, which decides whether that emit is accepted,
//      plus the ListTools JSON schema the client validates against.
// Nothing failed until a customer ran the command, and the failure looked like
// their mistake. Both copies are compared here so the divergence fails the build.
import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ProjectEventTypeSchema } from '../src/utils/schemas.js';

const COMMANDS_DIR = join(process.cwd(), '..', '_wxAI', 'commands');

/** Every `- \`type\`: "value"` under a capture_event instruction in a command doc. */
function documentedEventTypes(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of readdirSync(COMMANDS_DIR).filter((f) => f.endsWith('.md'))) {
    const text = readFileSync(join(COMMANDS_DIR, file), 'utf8');
    // Only scan docs that actually instruct capture_event; other commands use
    // `type` for unrelated fields (feedback type, doctype, ...).
    if (!text.includes('project.capture_event')) continue;
    for (const m of text.matchAll(/`type`:\s*"([a-z0-9_]+)"/g)) {
      const list = found.get(m[1]) ?? [];
      list.push(file);
      found.set(m[1], list);
    }
  }
  return found;
}

describe('capture_event event-type contract', () => {
  it('accepts every type the shipped commands instruct consumers to emit', () => {
    // Kit consumers ship mcp-server without the command tree; skip rather than fail.
    if (!existsSync(COMMANDS_DIR)) {
      expect(true).toBe(true);
      return;
    }

    const documented = documentedEventTypes();
    // If this is empty the scrape broke (docs restructured), not "nothing to check".
    expect(
      documented.size,
      'no event types scraped from _wxAI/commands — the doc format changed, update this guard',
    ).toBeGreaterThan(0);

    const accepted = new Set<string>(ProjectEventTypeSchema.options);
    const rejected = [...documented.entries()]
      .filter(([type]) => !accepted.has(type))
      .map(([type, files]) => `${type} (${files.join(', ')})`);

    expect(
      rejected,
      'these types are documented but would fail validation — add them to ProjectEventTypeSchema',
    ).toEqual([]);
  });

  it('keeps every accepted type within the events.type column width', () => {
    // events.type is varchar(50); an over-long value passes zod and then fails at INSERT.
    const tooLong = ProjectEventTypeSchema.options.filter((t) => t.length > 50);
    expect(tooLong).toEqual([]);
  });
});
