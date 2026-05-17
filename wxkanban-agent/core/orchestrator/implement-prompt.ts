import { SpecBundle, SpecTask } from "./spec-loader";

const SYSTEM_PROMPT = `You are the wxKanban code-generation agent for the wxkanban-agent kit.
You write production TypeScript / SQL / config code that satisfies a single spec task at a time.

Hard rules:
- Output ONLY a JSON object. No prose, no markdown fences, no explanation.
- JSON shape: { "files": [{ "path": "<repo-relative path>", "body": "<full file contents>", "action": "create" | "modify" | "delete" }] }
- The top-level value MUST be a JSON object with a single "files" key whose value is an array.
- Use 'create' when the file does not yet exist; 'modify' when it does; 'delete' when removing a file.
- For 'delete' action, set "body" to the empty string ("") — it is ignored by the orchestrator.
- Match the project's existing conventions: TypeScript strict, Drizzle ORM, Pino logging, lowercase no-underscore table names.
- Never invent dependencies that are not in package.json.
- Never reference Clerk or other auth providers — wxKanban uses custom bcrypt + JWT.
- Never include console.log. Use Pino via the project's logger module.
- Do NOT write fence comments (// [SCOPE ...] BEGIN). The orchestrator inserts those.
- If the task implies multiple files, return them all in the same "files" array.
- File bodies must be complete, valid, and ready to compile.
- Inside "body" string values, every backslash MUST be doubled (\\\\) so regex literals like /\\\\s+/g survive JSON parsing.`;

export function buildImplementPrompt(opts: {
  bundle: SpecBundle;
  task: SpecTask;
}): { systemPrompt: string; userPrompt: string } {
  const { bundle, task } = opts;
  const sections: string[] = [];

  sections.push(`SPEC ${bundle.scope}: ${bundle.slug}`);
  sections.push("");
  sections.push(`TASK: ${task.id} — ${task.title}`);
  sections.push("");

  sections.push("### spec.md (full text)");
  sections.push(bundle.specText);

  if (bundle.dataModelText) {
    sections.push("### data-model.md");
    sections.push(bundle.dataModelText);
  }
  if (bundle.contractsText) {
    sections.push("### contracts/");
    sections.push(bundle.contractsText);
  }

  sections.push("");
  sections.push("### Your job");
  sections.push(
    `Output the file(s) needed to complete task ${task.id}. Respond with a JSON array as described in the system prompt. No other text.`,
  );

  return { systemPrompt: SYSTEM_PROMPT, userPrompt: sections.join("\n\n") };
}

export interface ProposedFile {
  path: string;
  body: string;
  action: "create" | "modify" | "delete";
}

export class ProposalParseError extends Error {
  constructor(message: string, public readonly raw: string) {
    super(message);
    this.name = "ProposalParseError";
  }
}

export function parseProposal(raw: string): ProposedFile[] {
  let text = raw.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```(?:json)?\s*\n/, "").replace(/\n```\s*$/, "");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    // Spec 019 R7 AC 7 — include byte offset + 160-char window around the
    // failure point so diagnosing escape errors does not require re-running.
    const message = (err as Error).message;
    const offsetMatch = message.match(/position (\d+)/);
    let window = "";
    if (offsetMatch) {
      const offset = parseInt(offsetMatch[1] ?? "0", 10);
      const start = Math.max(0, offset - 80);
      const end = Math.min(text.length, offset + 80);
      window = ` — context: ${JSON.stringify(text.slice(start, end))}`;
    }
    throw new ProposalParseError(
      `AI response is not valid JSON: ${message}${window}`,
      raw,
    );
  }
  // Spec 019 R7 AC 6 — JSON-mode returns a top-level object { files: [...] }.
  // We also accept a bare array for backwards compatibility with providers
  // that ignore the response-format flag (e.g., Anthropic).
  let items: unknown;
  if (Array.isArray(parsed)) {
    items = parsed;
  } else if (parsed && typeof parsed === "object" && Array.isArray((parsed as Record<string, unknown>)["files"])) {
    items = (parsed as Record<string, unknown>)["files"];
  } else {
    throw new ProposalParseError(
      'AI response must be { "files": [...] } or a bare array of { path, body, action }',
      raw,
    );
  }
  const files: ProposedFile[] = [];
  for (const item of items as unknown[]) {
    if (!item || typeof item !== "object") {
      throw new ProposalParseError("Array item is not an object", raw);
    }
    const rec = item as Record<string, unknown>;
    const path = rec["path"];
    const body = rec["body"];
    const action = rec["action"];
    if (typeof path !== "string" || typeof body !== "string") {
      throw new ProposalParseError(
        "Array item is missing string path or body",
        raw,
      );
    }
    if (action !== "create" && action !== "modify" && action !== "delete") {
      throw new ProposalParseError(
        `Array item has invalid action '${String(action)}' (must be 'create', 'modify', or 'delete')`,
        raw,
      );
    }
    files.push({ path, body, action });
  }
  return files;
}
