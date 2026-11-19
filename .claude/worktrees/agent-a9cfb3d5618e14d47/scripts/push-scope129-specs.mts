// Push the SCOPE-129 fan-out (SPEC-126..129) to the wxKanban DB via the hosted MCP /call
// transport, using the SAME scopeContent that scripts/gen-scope129-specs.mts wrote to disk.
//
// Reads credentials from .env itself — they are never printed.
//   npx tsx scripts/push-scope129-specs.mts [--dry-run]
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "dotenv/config";

const DRY = process.argv.includes("--dry-run");

const token = process.env.WXKANBAN_API_TOKEN;
const projectId = process.env.WXKANBAN_PROJECT_ID;
const base = "https://mcp.wxperts.com";

if (!token) { console.error("WXKANBAN_API_TOKEN is not set in .env"); process.exit(1); }
if (!projectId) { console.error("WXKANBAN_PROJECT_ID is not set in .env"); process.exit(1); }
console.log("token present:", Boolean(token), " projectId present:", Boolean(projectId));

interface Payload {
  specNumber: string;
  featureName: string;
  slug: string;
  scopeContent: string;
  tasks: { title: string; description: string; priority: string; status: string }[];
}

const payloads: Payload[] = JSON.parse(
  readFileSync(join(process.cwd(), "scripts", "scope129-specs.payload.json"), "utf-8"),
);

for (const p of payloads) {
  const args = {
    projectId,
    specNumber: p.specNumber,
    featureName: p.featureName,
    scopeContent: p.scopeContent,
    phase: "design",
    priority: "high",
    tasks: p.tasks,
    generateLifecycle: true,
  };

  if (DRY) {
    console.log(`[dry-run] ${p.specNumber} ${p.featureName} — ${p.scopeContent.length} chars, ${p.tasks.length} tasks`);
    continue;
  }

  const res = await fetch(`${base}/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ tool: "project.create_specs", args }),
  });

  const text = await res.text();
  // The shape is whatever the transport returns, so it is read defensively rather than asserted.
  type Envelope = { content?: { text?: string }[] } & Record<string, unknown>;
  let parsed: Envelope | null = null;
  try { parsed = JSON.parse(text) as Envelope; } catch { parsed = null; }

  // The /call envelope sometimes wraps the tool result in content[0].text
  let r: Record<string, unknown> | null = parsed;
  const inner = parsed?.content?.[0]?.text;
  if (typeof inner === "string") {
    try { r = JSON.parse(inner) as Record<string, unknown>; } catch { r = parsed; }
  }

  const get = (k: string): unknown => (r ? r[k] : undefined);
  const len = (k: string): number => (Array.isArray(get(k)) ? (get(k) as unknown[]).length : 0);

  if (get("success") === false || get("blocked")) {
    console.log(`FAIL ${p.specNumber}  http=${res.status}  ${String(get("message") ?? "")}`);
    console.log("      blocking:", JSON.stringify(get("blockingIssues") ?? []));
    continue;
  }

  const spec = get("spec") as { id?: string } | undefined;
  console.log(
    `OK   ${p.specNumber} ${p.featureName}` +
    `  http=${res.status}` +
    `  specId=${spec?.id ?? "?"}` +
    `  docs=${len("documents")}` +
    `  tasks=${len("tasks")}` +
    `  lifecycle=${String(get("lifecycleGenerated") ?? "?")}`,
  );
}
