import { existsSync, readFileSync, statSync } from "fs";
import { join, dirname, resolve } from "path";

export interface ConsumerRootInfo {
  root: string;
  hasWxai: boolean;
  hasKitDep: boolean;
}

export interface FindOptions {
  stopAt?: string;
}

// [SCOPE 036 / T001] BEGIN — core/scaffold/consumer-detect.ts — findConsumerRoot
export function findConsumerRoot(cwd: string = process.cwd(), opts: FindOptions = {}): string | null {
  const info = findConsumerRootInfo(cwd, opts);
  return info?.root ?? null;
}
// [SCOPE 036 / T001] END

// [SCOPE 036 / T001] BEGIN — findConsumerRootInfo with marker details
export function findConsumerRootInfo(cwd: string = process.cwd(), opts: FindOptions = {}): ConsumerRootInfo | null {
  let dir = resolve(cwd);
  const stopAt = opts.stopAt ? resolve(opts.stopAt) : null;
  const seen = new Set<string>();
  while (!seen.has(dir)) {
    seen.add(dir);
    const wxaiDir = join(dir, ".wxai");
    const pkgPath = join(dir, "package.json");
    const hasWxai = existsSync(wxaiDir) && safeIsDir(wxaiDir);
    const hasKitDep = pkgHasKitDep(pkgPath);
    if (hasWxai || hasKitDep) {
      return { root: dir, hasWxai, hasKitDep };
    }
    if (stopAt && dir === stopAt) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}
// [SCOPE 036 / T001] END

// [SCOPE 036 / T001] BEGIN — pkgHasKitDep
export function pkgHasKitDep(pkgPath: string): boolean {
  if (!existsSync(pkgPath)) return false;
  try {
    const raw = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(raw) as Record<string, unknown>;
    const deps = (pkg.dependencies ?? {}) as Record<string, string>;
    const devDeps = (pkg.devDependencies ?? {}) as Record<string, string>;
    return "wxkanban-agent" in deps || "wxkanban-agent" in devDeps;
  } catch {
    return false;
  }
}
// [SCOPE 036 / T001] END

// [SCOPE 036 / T001] BEGIN — safeIsDir helper
function safeIsDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}
// [SCOPE 036 / T001] END
