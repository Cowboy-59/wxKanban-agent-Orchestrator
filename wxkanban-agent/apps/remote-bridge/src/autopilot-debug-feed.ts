import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { redactSecrets } from "./handoff-writer";

// [SCOPE 154 / T015] BEGIN — `go debug`: a unit session's steps as room lines (FR-017)
// A unit session's messages are complete assistant turns (no partial stream events), so each one
// carries its tool calls with their inputs and its text in full. Every line is masked with the
// same redactSecrets the heartbeat uses before it can reach the room.

function summarizeTool(name: string, input: unknown): string {
  if (input && typeof input === "object") {
    const rec = input as Record<string, unknown>;
    const target = rec.command ?? rec.file_path ?? rec.path ?? rec.pattern ?? rec.skill ?? rec.url ?? rec.prompt;
    if (typeof target === "string") return `${name}: ${target.slice(0, 120)}`;
  }
  return name;
}

/** The room lines for one unit-session message: `· tool: target` per tool call, then its text. Empty for anything else. */
export function describeUnitMessage(msg: SDKMessage): string[] {
  if (msg.type !== "assistant") return [];
  const content = (msg as Extract<SDKMessage, { type: "assistant" }>).message.content as unknown;
  if (!Array.isArray(content)) return [];
  const lines: string[] = [];
  const text: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as { type?: unknown; name?: unknown; input?: unknown; text?: unknown };
    if (b.type === "tool_use") lines.push(`· ${summarizeTool(typeof b.name === "string" ? b.name : "tool", b.input)}`);
    else if (b.type === "text" && typeof b.text === "string" && b.text.trim()) text.push(b.text.trim());
  }
  if (text.length > 0) lines.push(text.join("\n"));
  return lines.map((l) => redactSecrets(l).text);
}
// [SCOPE 154 / T015] END
