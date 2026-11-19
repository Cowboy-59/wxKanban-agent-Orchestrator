import { readFileSync, writeFileSync, renameSync, existsSync } from "fs";
import { dirname, join, basename } from "path";
import { emitFence } from "./fence-emitter";

export interface FenceMigrationOptions {
  filepath: string;
  ownerScope: string;
  ownerTask: string;
  description: string;
}

export interface FenceMigrationResult {
  changed: boolean;
  outputContent: string;
}

export function fenceMigrationFile(
  opts: FenceMigrationOptions,
): FenceMigrationResult {
  if (!existsSync(opts.filepath)) {
    throw new Error(`Migration file does not exist: ${opts.filepath}`);
  }
  const currentContent = readFileSync(opts.filepath, "utf-8");

  if (
    currentContent.includes(
      `[SCOPE ${opts.ownerScope} / ${opts.ownerTask}] BEGIN`,
    )
  ) {
    return { changed: false, outputContent: currentContent };
  }

  const fenced = emitFence({
    filepath: opts.filepath,
    currentContent: null,
    proposedContent: currentContent,
    ownerScope: opts.ownerScope,
    ownerTask: opts.ownerTask,
    description: opts.description,
    existingFences: [],
  });

  if (fenced.skipped) {
    return { changed: false, outputContent: currentContent };
  }

  const tmpPath = join(
    dirname(opts.filepath),
    `.${basename(opts.filepath)}.tmp.${process.pid}`,
  );
  writeFileSync(tmpPath, fenced.content);
  renameSync(tmpPath, opts.filepath);
  return { changed: true, outputContent: fenced.content };
}
