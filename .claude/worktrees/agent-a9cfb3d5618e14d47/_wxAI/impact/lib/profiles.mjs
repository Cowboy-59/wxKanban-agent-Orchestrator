// Built-in link profiles for stacks the engine does not read natively (SCOPE-137 FR-005).
//
// JS/TS is read natively (imports resolved, Drizzle parsed — Confirmed). Every
// other stack the kit offers is read through a profile: how imports, route
// declarations, data access and env vars look in that language. The profile is
// written into the project's SCOPE-127 stack adapter as a `## Change Impact links`
// section (where a project can extend it); this file is its default. Links from
// a profile are Likely until that adapter passes its proof fixture (FR-014).

// [SCOPE 137 / T007] BEGIN — Built-in language link profiles (FR-005)
// MODIFIED-BY: [SCOPE 137 / T015] — class-level route bases (ASP.NET [Route], Spring @RequestMapping), found by the C# proof fixture
/**
 * Each profile: extensions; import token patterns (group 1 = module path);
 * route declaration patterns (method group or fixed method, path group);
 * data write/read patterns (group 1 = table or model name); env var patterns.
 * Route paths use `{id}` or `:id`; both are normalized to `:id` for matching.
 * A route marked `base` is a class-level prefix: `relative` joins it to method
 * routes that do not start with `/` (ASP.NET), `always` joins it to every one (Spring).
 */
export const LANGUAGE_PROFILES = {
  python: {
    extensions: ['.py'],
    imports: [/^\s*from\s+([\w.]+)\s+import\b/gm, /^\s*import\s+([\w.]+)/gm],
    routes: [
      { re: /@\w+\.(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g, method: 1, path: 2 },
      { re: /\bpath\(\s*['"]([^'"]*)['"]/g, method: null, path: 1, prefix: '/' },
    ],
    dataWrite: [/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?(\w+)/gi, /session\.add\(\s*(\w+)\(/g, /\b(\w+)\.objects\.(?:create|update|bulk_create|filter\([^)]*\)\.(?:update|delete))/g],
    dataRead: [/\b(?:FROM|JOIN)\s+["`]?(\w+)/gi, /\.query\(\s*(\w+)\s*\)/g, /\b(\w+)\.objects\.(?:get|filter|all|exclude)\b/g, /__tablename__\s*=\s*['"](\w+)['"]/g],
    env: [/os\.environ(?:\.get)?\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g, /os\.environ\[\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\]/g, /os\.getenv\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g],
  },
  ruby: {
    extensions: ['.rb'],
    imports: [/^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/gm],
    routes: [{ re: /^\s*(get|post|put|patch|delete)\s+['"]([^'"]+)['"]/gm, method: 1, path: 2 }],
    dataWrite: [/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?(\w+)/gi, /\b([A-Z]\w+)\.(?:create!?|update(?:_all)?!?|destroy(?:_all)?|delete_all|insert_all)\b/g],
    dataRead: [/\b(?:FROM|JOIN)\s+["`]?(\w+)/gi, /\b([A-Z]\w+)\.(?:find(?:_by)?|where|all|first|last|pluck)\b/g],
    env: [/ENV\[\s*['"]([A-Z][A-Z0-9_]{2,})['"]\s*\]/g, /ENV\.fetch\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g],
  },
  go: {
    extensions: ['.go'],
    imports: [/^\s*(?:import\s+)?(?:\w+\s+)?"([\w./-]+)"\s*$/gm],
    routes: [{ re: /\.(GET|POST|PUT|PATCH|DELETE)\(\s*"([^"]+)"/g, method: 1, path: 2 }, { re: /HandleFunc\(\s*"([^"]+)"/g, method: null, path: 1 }],
    dataWrite: [/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?(\w+)/gi, /\.Table\(\s*"(\w+)"\s*\)\.(?:Create|Update|Delete)/g],
    dataRead: [/\b(?:FROM|JOIN)\s+["`]?(\w+)/gi, /\.Table\(\s*"(\w+)"\s*\)/g],
    env: [/os\.Getenv\(\s*"([A-Z][A-Z0-9_]{2,})"/g, /os\.LookupEnv\(\s*"([A-Z][A-Z0-9_]{2,})"/g],
  },
  java: {
    extensions: ['.java', '.kt'],
    imports: [/^\s*import\s+(?:static\s+)?([\w.]+)\s*;?\s*$/gm],
    routes: [{ re: /@(Get|Post|Put|Patch|Delete)Mapping\(\s*(?:value\s*=\s*)?"([^"]+)"/g, method: 1, path: 2 }, { re: /@RequestMapping\(\s*(?:value\s*=\s*)?"([^"]+)"/g, method: null, path: 1, base: 'always' }],
    dataWrite: [/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?(\w+)/gi, /@Table\(\s*name\s*=\s*"(\w+)"/g],
    dataRead: [/\b(?:FROM|JOIN)\s+["`]?(\w+)/gi, /JpaRepository<\s*(\w+)\s*,/g],
    env: [/System\.getenv\(\s*"([A-Z][A-Z0-9_]{2,})"/g],
  },
  php: {
    extensions: ['.php'],
    imports: [/^\s*use\s+([\w\\]+)\s*;/gm, /require(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g],
    routes: [{ re: /Route::(get|post|put|patch|delete)\(\s*['"]([^'"]+)['"]/g, method: 1, path: 2 }],
    dataWrite: [/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`]?(\w+)/gi, /DB::table\(\s*['"](\w+)['"]\s*\)->(?:insert|update|delete)/g, /\b([A-Z]\w+)::(?:create|update|destroy)\(/g],
    dataRead: [/\b(?:FROM|JOIN)\s+["`]?(\w+)/gi, /DB::table\(\s*['"](\w+)['"]/g, /\b([A-Z]\w+)::(?:find|where|all|first)\(/g, /protected\s+\$table\s*=\s*['"](\w+)['"]/g],
    env: [/env\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g, /getenv\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g],
  },
  csharp: {
    extensions: ['.cs', '.vb'],
    imports: [/^\s*using\s+(?:static\s+)?([\w.]+)\s*;/gm, /^\s*Imports\s+([\w.]+)/gm],
    routes: [{ re: /\[Http(Get|Post|Put|Patch|Delete)\(\s*"([^"]*)"/g, method: 1, path: 2 }, { re: /\[Route\(\s*"([^"]+)"/g, method: null, path: 1, base: 'relative' }, { re: /\.Map(Get|Post|Put|Patch|Delete)\(\s*"([^"]+)"/g, method: 1, path: 2 }],
    dataWrite: [/\b(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["`\[]?(\w+)/gi, /\.(\w+)\.(?:Add|AddRange|Update|Remove|RemoveRange)\(/g],
    dataRead: [/\b(?:FROM|JOIN)\s+["`\[]?(\w+)/gi, /DbSet<\s*(\w+)\s*>/g, /\[Table\(\s*"(\w+)"/g],
    env: [/Environment\.GetEnvironmentVariable\(\s*"([A-Z][A-Z0-9_]{2,})"/g],
  },
};

/** The profile for a file, by extension, or null when no profile reads it. */
export function profileFor(file) {
  for (const [lang, p] of Object.entries(LANGUAGE_PROFILES)) {
    if (p.extensions.some((e) => file.toLowerCase().endsWith(e))) return { lang, ...p };
  }
  return null;
}

/** Every extension some profile reads. */
export const PROFILE_EXT = Object.values(LANGUAGE_PROFILES).flatMap((p) => p.extensions);
// [SCOPE 137 / T007] END
