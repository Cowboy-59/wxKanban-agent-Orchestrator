// [SCOPE 055] Materialize the project's stack.md from the DB ProjectStack document.
// The Stack & Style is captured in the wxKanban web app at project creation and
// stored as the project's ProjectStack document (DB is the source of truth). The
// hosted server cannot write the dev's working tree, so the kit pulls the document
// (project.get_stack) and writes stack.md here, on project open.
//
// Non-destructive: writes stack.md when it is missing; if a local stack.md already
// exists and differs from the DB content, it reports a conflict rather than
// clobbering local edits (use `/buildstack` to update both legs in sync).
import * as fs from "fs";
import * as path from "path";
import { McpClient, getDefaultMcpClient, resolveProjectId } from "../../http/mcp-client";

export interface MaterializeStackResult {
  status: "written" | "unchanged" | "conflict" | "none" | "error";
  file: string | null;
  error?: string;
}

// Unwrap the MCP wire envelope ({ content: [{ text }] }) into the inner JSON.
function unwrap<T>(data: unknown): T {
  const d = data as { content?: Array<{ text?: string }> } | T;
  const text = (d as { content?: Array<{ text?: string }> })?.content?.[0]?.text;
  return (text ? JSON.parse(text) : d) as T;
}

export async function materializeStack(opts: {
  projectRoot?: string;
  client?: McpClient;
}): Promise<MaterializeStackResult> {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const client = opts.client ?? getDefaultMcpClient(projectRoot);
  const projectId = resolveProjectId({ projectRoot });
  if (!projectId) {
    throw new Error("materialize-stack: no projectId resolved for this workspace.");
  }

  const res = await client.callTool<unknown>("project.get_stack", { projectId });
  if (!res.ok) {
    throw new Error(`get_stack failed (${res.status}): ${res.error ?? "unknown"}`);
  }
  const { stack } = unwrap<{ stack: { content: string } | null }>(res.data);
  if (!stack?.content) {
    return { status: "none", file: null };
  }

  const file = path.join(projectRoot, "stack.md");
  if (fs.existsSync(file)) {
    const local = fs.readFileSync(file, "utf-8");
    if (local === stack.content) return { status: "unchanged", file: "stack.md" };
    // Local edits diverge from the DB source of truth — do not clobber.
    return { status: "conflict", file: "stack.md" };
  }

  fs.writeFileSync(file, stack.content, "utf-8");
  return { status: "written", file: "stack.md" };
}
