// [SCOPE 058 / T022] BEGIN — pure FR-008 read-only computation (no vscode import,
// so it's unit-testable under plain Node like the other cockpit logic modules).
// Given the claim state, produce the files.readonlyInclude / files.readonlyExclude
// maps: in a multi-member project all spec docs are read-only EXCEPT the scopes the
// viewer holds; in a single-member (claims-off) project our globs are relinquished
// entirely. Foreign globs the user set themselves are always preserved.

export const INCLUDE_GLOB = 'specs/**/*.md';
// Matches ONLY the per-scope exclude globs we manage (specs/NNN-* and
// specs/Project-Scope/NNN-*), so recomputing never drops a user's own entries.
export const OUR_EXCLUDE_RE = /^specs\/(Project-Scope\/)?\d{3}-\*/;

export function computeReadonlyConfig(
  claimsEnabled: boolean,
  heldByMe: string[],
  prevInclude: Record<string, boolean>,
  prevExclude: Record<string, boolean>,
): { include: Record<string, boolean>; exclude: Record<string, boolean> } {
  const include = { ...prevInclude };
  // Preserve foreign exclude keys; drop the per-scope ones we previously set.
  const exclude: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(prevExclude)) {
    if (!OUR_EXCLUDE_RE.test(k)) exclude[k] = v;
  }

  if (!claimsEnabled) {
    // Single-member / claims off — relinquish our include glob so the sole
    // developer edits every spec freely (FR-008 + single-member rule).
    delete include[INCLUDE_GLOB];
    return { include, exclude };
  }

  include[INCLUDE_GLOB] = true;
  for (const n of heldByMe) {
    exclude[`specs/${n}-*/**/*.md`] = true;
    exclude[`specs/Project-Scope/${n}-*.md`] = true;
  }
  return { include, exclude };
}
// [SCOPE 058 / T022] END
