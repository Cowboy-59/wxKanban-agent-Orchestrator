// Proof fixture registry (SCOPE-137 FR-014). Kept apart from prove.mjs so the
// engine can read which link types each profile proves without importing the
// runner, which itself imports the engine.

import { fixture as jsTs } from './js-ts.mjs';
import { fixture as csharp } from './csharp.mjs';

// [SCOPE 137 / T015] BEGIN — Proof fixture registry, keyed by the profile an adapter names (FR-014)
/** `**Links profile:**` value → its fixture. A profile with no fixture cannot be proven. */
export const FIXTURES = { native: jsTs, csharp };

/** The link types a profile's fixture proves — only these may be promoted once it passes. */
export function provenTypes(profile) {
  const fixture = FIXTURES[profile];
  return new Set(fixture ? fixture.cases.flatMap((c) => (c.expect ?? []).map((e) => e.type)) : []);
}
// [SCOPE 137 / T015] END
