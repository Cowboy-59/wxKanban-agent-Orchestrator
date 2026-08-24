/**
 * One-off: push a Project-Scope markdown file into the hub as a scope document.
 *
 * dbpush does NOT read specs/Project-Scope/*.md — it walks specs/NNN-name/ only
 * (verified 2026-08-20; "Project-Scope" appears in dbpush.ts solely inside a
 * warning about archiving duplicate folders). So a scope-doc amendment has no
 * sync path through dbpush, and this wrapper supplies it.
 *
 * Reads the file from disk rather than taking content on the command line, so a
 * 90 KB scope never has to travel through an assistant's context to reach the DB.
 *
 * Convention (set by the project owner 2026-08-20):
 *   doctype = "scope"
 *   title   = the file's name
 *
 * Both are the upsert match key — (projectId, doctype, title) — so changing
 * either on a later run creates a second row rather than updating this one.
 *
 * Usage (cwd = repo root, so .env and .wxai resolve):
 *   node_modules/.bin/ts-node --transpile-only wxkanban-agent/push-scope-doc.ts <path> [--dry-run]
 */
import { readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { getDefaultMcpClient, resolveProjectId } from "./core/http/mcp-client";
// resolveApiToken() reads process.env but does not populate it; the kit CLIs run
// as plain node with nothing preloaded, which is exactly what this helper exists
// for. Reusing it rather than hand-parsing keeps one loader in the codebase.
import { loadProjectEnv } from "./core/bootstrap/load-env";

/** CLI report output. Not application logging — Pino is for the app, this is a
 * report a human reads on stdout, so it is written there explicitly. */
function say(line = ""): void {
  process.stdout.write(`${line}\n`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const target = args.find((a) => !a.startsWith("--"));

  // An unrecognised or missing argument must NOT fall through to a write. dbpush
  // treating `--help` as "run it for real" cost two unintended production pushes
  // on 2026-08-20; this refuses instead.
  if (!target) {
    console.error("push-scope-doc: pass the path to a Project-Scope markdown file.");
    console.error("  add --dry-run to print what would be sent without writing.");
    process.exitCode = 1;
    return;
  }
  const unknown = args.filter((a) => a.startsWith("--") && a !== "--dry-run");
  if (unknown.length > 0) {
    console.error(`push-scope-doc: unrecognised flag(s): ${unknown.join(", ")}. Refusing to run.`);
    process.exitCode = 1;
    return;
  }

  const abs = resolve(target);
  const body = readFileSync(abs, "utf8");
  const title = basename(abs);
  const projectId = resolveProjectId();

  if (!projectId) {
    console.error("push-scope-doc: could not resolve projectId from .wxai/project.json.");
    process.exitCode = 1;
    return;
  }

  say(`projectId : ${projectId}`);
  say(`doctype   : scope`);
  say(`title     : ${title}`);
  say(`body      : ${body.length} chars from ${abs}`);

  if (dryRun) {
    say("\n(dry-run — nothing was sent)");
    return;
  }

  loadProjectEnv();
  const client = getDefaultMcpClient();
  const res = await client.callTool("project.upsert_document", {
    projectId,
    doctype: "scope",
    title,
    bodyMarkdown: body,
  });

  say("\nresult:", JSON.stringify(res, null, 2).slice(0, 1200));
}

main().catch((err) => {
  console.error("push-scope-doc failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
