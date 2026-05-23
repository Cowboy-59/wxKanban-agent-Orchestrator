import { existsSync, readFileSync, renameSync, writeFileSync } from "fs";

export interface DepDelta {
  name: string;
  version: string;
  kind: "dependencies" | "devDependencies";
  status: "added" | "present";
}

export interface DepDiff {
  added: DepDelta[];
  alreadyPresent: DepDelta[];
}

export interface MergeResult {
  changed: boolean;
  diff: DepDiff;
  packageJson: Record<string, unknown>;
}

export interface DepsToAdd {
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

// [SCOPE 036 / T003] BEGIN — core/scaffold/deps-merge.ts — mergeDeps (preserves consumer pins)
export function mergeDeps(packageJson: Record<string, unknown>, additions: DepsToAdd): MergeResult {
  const out: Record<string, unknown> = { ...packageJson };
  const added: DepDelta[] = [];
  const alreadyPresent: DepDelta[] = [];

  for (const kind of ["dependencies", "devDependencies"] as const) {
    const current = ((out[kind] as Record<string, string> | undefined) ?? {});
    const next: Record<string, string> = { ...current };
    const toAdd = additions[kind];
    for (const [name, version] of Object.entries(toAdd)) {
      if (name in current) {
        alreadyPresent.push({ name, version: current[name], kind, status: "present" });
      } else {
        next[name] = version;
        added.push({ name, version, kind, status: "added" });
      }
    }
    out[kind] = sortObjectKeys(next);
  }

  return {
    changed: added.length > 0,
    diff: { added, alreadyPresent },
    packageJson: out,
  };
}
// [SCOPE 036 / T003] END

// [SCOPE 036 / T003] BEGIN — readPackageJson
export function readPackageJson(absPath: string): Record<string, unknown> | null {
  if (!existsSync(absPath)) return null;
  try {
    return JSON.parse(readFileSync(absPath, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}
// [SCOPE 036 / T003] END

// [SCOPE 036 / T003] BEGIN — writePackageJson (atomic)
export function writePackageJson(absPath: string, data: Record<string, unknown>): void {
  const tmp = `${absPath}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
  renameSync(tmp, absPath);
}
// [SCOPE 036 / T003] END

// [SCOPE 036 / T003] BEGIN — sortObjectKeys helper
function sortObjectKeys(obj: Record<string, string>): Record<string, string> {
  const sorted: Record<string, string> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted;
}
// [SCOPE 036 / T003] END
