import { resolve, extname, dirname } from "path";
import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  renameSync,
} from "fs";
import { loadSpecBundle, findTask } from "../spec-loader";
import { emitFence, NoDetectableUnitError } from "../fence-emitter";
import { isSuppressed } from "../language-matrix";

export interface CreateTestTasksOptions {
  scope: string;
  task: string;
  projectRoot?: string;
  specsRoot?: string;
  proposedFiles: Array<{ path: string; body: string }>;
}

export interface CreateTestTasksResult {
  exitCode: 0 | 1 | 2;
  filesWritten: string[];
  filesSkipped: string[];
  warnings: string[];
}

export async function handleCreateTestTasksCommand(
  options: CreateTestTasksOptions,
): Promise<CreateTestTasksResult> {
  const projectRoot = options.projectRoot ?? process.cwd();
  const specsRoot = resolve(projectRoot, options.specsRoot ?? "specs");

  const bundle = loadSpecBundle(specsRoot, options.scope);
  const task = findTask(bundle, options.task);

  const filesWritten: string[] = [];
  const filesSkipped: string[] = [];
  const warnings: string[] = [];

  for (const file of options.proposedFiles) {
    const absPath = resolve(projectRoot, file.path);
    const currentContent = existsSync(absPath)
      ? readFileSync(absPath, "utf-8")
      : null;
    const ext = extname(file.path);

    let outputContent = file.body;
    if (!isSuppressed(ext)) {
      try {
        const result = emitFence({
          filepath: file.path,
          currentContent,
          proposedContent: file.body,
          ownerScope: options.scope,
          ownerTask: options.task,
          description: task.title,
          existingFences: [],
        });
        outputContent = result.content;
        warnings.push(...result.warnings);
      } catch (err) {
        if (err instanceof NoDetectableUnitError) {
          warnings.push(`${file.path}: ${err.message}`);
          filesSkipped.push(file.path);
          continue;
        }
        throw err;
      }
    }

    mkdirSync(dirname(absPath), { recursive: true });
    const tmpPath = `${absPath}.tmp.${process.pid}`;
    writeFileSync(tmpPath, outputContent);
    renameSync(tmpPath, absPath);
    filesWritten.push(file.path);
  }

  return {
    exitCode: 0,
    filesWritten,
    filesSkipped,
    warnings,
  };
}
