import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { dirname, join } from "path";

export type CopyResult = "created" | "skipped" | "overwritten";

export interface CopyOptions {
  overwrite?: boolean;
}

// [SCOPE 036 / T002] BEGIN — core/scaffold/template-copy.ts — copyTemplate (atomic, idempotent)
export function copyTemplate(srcAbs: string, destAbs: string, opts: CopyOptions = {}): CopyResult {
  const exists = existsSync(destAbs);
  if (exists && !opts.overwrite) return "skipped";
  const content = readFileSync(srcAbs, "utf-8");
  mkdirSync(dirname(destAbs), { recursive: true });
  const tmp = `${destAbs}.tmp.${process.pid}`;
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, destAbs);
  return exists ? "overwritten" : "created";
}
// [SCOPE 036 / T002] END

// [SCOPE 036 / T002] BEGIN — writeTemplateString — same semantics but content is in-memory
export function writeTemplateString(content: string, destAbs: string, opts: CopyOptions = {}): CopyResult {
  const exists = existsSync(destAbs);
  if (exists && !opts.overwrite) return "skipped";
  mkdirSync(dirname(destAbs), { recursive: true });
  const tmp = `${destAbs}.tmp.${process.pid}`;
  writeFileSync(tmp, content, "utf-8");
  renameSync(tmp, destAbs);
  return exists ? "overwritten" : "created";
}
// [SCOPE 036 / T002] END

export interface TemplateMapping {
  srcRel: string;
  destRel: string;
}

// [SCOPE 036 / T002] BEGIN — planCopies — produce action plan without writes
export function planCopies(
  mappings: TemplateMapping[],
  templatesRoot: string,
  consumerRoot: string,
  opts: CopyOptions = {},
): Array<{ srcAbs: string; destAbs: string; action: CopyResult | "would create" | "would overwrite" | "would skip" }> {
  return mappings.map((m) => {
    const srcAbs = join(templatesRoot, m.srcRel);
    const destAbs = join(consumerRoot, m.destRel);
    const exists = existsSync(destAbs);
    let action: CopyResult | "would create" | "would overwrite" | "would skip";
    if (!exists) action = "would create";
    else if (opts.overwrite) action = "would overwrite";
    else action = "would skip";
    return { srcAbs, destAbs, action };
  });
}
// [SCOPE 036 / T002] END
