// Release checks for the Customer edition (SCOPE-141): the leak scan (FR-005, SOC 2 CC6.1),
// the output-path guard, and the check that customer text names no retired or unknown command.
import path from "node:path";

// [SCOPE 141 / T008] BEGIN — Leak scan over built Customer output
export interface LeakHit {
  file: string;
  line: number;
  rule: string;
  excerpt: string;
}

interface LeakRule {
  rule: string;
  pattern: RegExp;
}

const LEAK_RULES: readonly LeakRule[] = [
  { rule: "env file", pattern: /(^|[^\w])\.env\b/ },
  { rule: "DATABASE_URL", pattern: /DATABASE_URL/ },
  { rule: "connection string", pattern: /\b(postgres(ql)?|mysql|mongodb(\+srv)?|redis|amqp):\/\/\S+/i },
  { rule: "AWS host", pattern: /amazonaws\.com/i },
  { rule: "App Runner", pattern: /\bapp ?runner\b/i },
  { rule: "Stripe key", pattern: /\b(sk|rk|pk)_(live|test)_[A-Za-z0-9]{8,}/ },
  { rule: "AWS access key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { rule: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}/ },
  { rule: "private key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { rule: "internal path", pattern: /\b(src\/(server|client|db|shared)\/|mcp-server\/|wxkanban-agent\/(core|apps)\/)/ },
  { rule: "code fence marker", pattern: /\[SCOPE \d+ \/ T\d+\]/ },
];

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
const ALLOWED_EMAIL_DOMAINS = new Set(["example.com", "example.org", "example.net"]);

function visibleText(line: string): string {
  return line
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

/** Scans one built file's text (HTML or the PDF's source) and returns every leak, with its line. */
export function scanForLeaks(file: string, content: string): LeakHit[] {
  const hits: LeakHit[] = [];
  const lines = content.replace(/<style[\s\S]*?<\/style>/gi, (m) => "\n".repeat((m.match(/\n/g) ?? []).length)).split("\n");
  lines.forEach((raw, i) => {
    const text = visibleText(raw);
    for (const { rule, pattern } of LEAK_RULES) {
      if (pattern.test(text)) hits.push({ file, line: i + 1, rule, excerpt: text.trim().slice(0, 140) });
    }
    for (const m of text.matchAll(EMAIL)) {
      const domain = m[0].split("@")[1].toLowerCase();
      if (!ALLOWED_EMAIL_DOMAINS.has(domain)) hits.push({ file, line: i + 1, rule: "email address", excerpt: m[0] });
    }
  });
  return hits;
}

/** The Internal edition must never be written anywhere that ships. */
export function unsafeOutputReason(outputDir: string, repo: string): string | null {
  const relative = path.relative(repo, path.resolve(outputDir)).split(path.sep).join("/");
  if (relative === "public" || relative.startsWith("public/")) return `Internal output ${relative} is under public/, which ships with the app.`;
  if (relative === "_wxAI" || relative.startsWith("_wxAI/")) return `Internal output ${relative} is under _wxAI/, which ships with the kit.`;
  return null;
}
// [SCOPE 141 / T008] END

// [SCOPE 141 / T007] BEGIN — Customer text may only name live commands
export interface CommandMentionProblem {
  file: string;
  line: number;
  name: string;
  reason: string;
}

/**
 * Finds backticked slash commands in customer section text (`/name`) that are retired or do not
 * exist. App routes (known paths, or anything with a second slash) are not commands.
 */
export function checkCommandMentions(
  file: string,
  body: string,
  live: Set<string>,
  retired: Map<string, string>,
  routes: Set<string>,
): CommandMentionProblem[] {
  const problems: CommandMentionProblem[] = [];
  body.split("\n").forEach((line, i) => {
    for (const m of line.matchAll(/`\/([A-Za-z][A-Za-z0-9-]*)(?=[\s`])/g)) {
      const raw = m[1];
      const key = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (live.has(key)) continue;
      const reason = retired.get(key);
      if (reason) problems.push({ file, line: i + 1, name: `/${raw}`, reason: `retired: ${reason}` });
      else if (!routes.has(raw.toLowerCase())) problems.push({ file, line: i + 1, name: `/${raw}`, reason: "no such command" });
    }
  });
  return problems;
}
// [SCOPE 141 / T007] END
