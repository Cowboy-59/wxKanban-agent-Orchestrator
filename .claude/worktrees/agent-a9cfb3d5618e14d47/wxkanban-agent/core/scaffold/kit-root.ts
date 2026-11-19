import { existsSync } from "fs";
import { dirname, resolve } from "path";

// Locate the kit's bundled templates directory robustly — independent of how
// deep the calling module sits. Hard-coded `resolve(__dirname, "..","..","..",
// "templates")` breaks the moment the build layout changes (compiled dist/,
// bundling, or a moved file). Instead, walk up from the calling module's dir
// until we find a `templates/<sub>` directory, so it works whether running from
// source (core/...) or a compiled dist/ tree that ships templates alongside it.
//
// `startDir` should be the caller's __dirname. `sub` is the templates subdir to
// require (e.g. "skills" or "frontend").
export function findTemplatesDir(startDir: string, sub: string): string {
  let dir = resolve(startDir);
  for (let i = 0; i < 8; i++) {
    const candidate = resolve(dir, "templates", sub);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Fall back to the legacy three-up guess so behavior never silently changes
  // when (unexpectedly) nothing is found on the walk.
  return resolve(startDir, "..", "..", "..", "templates", sub);
}
