// Command Reference generator (SCOPE-141, FR-003 / FR-004).
// Reads every command source, works out what each command calls and what calls it, and writes
// one Manual section per command, three indexes, the Internal drift pages and commands.json.
// Deterministic and model-free: the same inputs always produce byte-identical output.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

// [SCOPE 141 / T003] BEGIN — Command model types
export type CommandKind = "slash" | "skill" | "cli" | "cockpit";
export type LinkLabel = "Confirmed" | "Likely" | "Mention";

export interface RawCommand {
  key: string;
  name: string;
  kind: CommandKind;
  invoke: string[];
  purpose: string;
  usage: string;
  scanText: string;
  sources: string[];
  cliHandler: boolean | null;
}

export interface CommandLink {
  target: string;
  label: LinkLabel;
}

export interface CommandEntry {
  key: string;
  id: string;
  name: string;
  kind: CommandKind;
  runsIn: string[];
  invoke: string[];
  purpose: string;
  usage: string;
  stage: string;
  stageConfidence: "Confirmed" | "Likely";
  calls: CommandLink[];
  calledBy: CommandLink[];
  mcpTools: string[];
  sources: string[];
  excluded: boolean;
  excludedReason: string | null;
}

export interface DriftFinding {
  kind: "missing-command" | "no-handler" | "references-retired";
  from: string;
  target: string;
  label: LinkLabel | null;
  detail: string;
}

export interface CommandModel {
  entries: CommandEntry[];
  drift: DriftFinding[];
}
// [SCOPE 141 / T003] END

// [SCOPE 141 / T003] BEGIN — Source readers (commands, skills, server prompts, CLI, Cockpit)
export function normalizeKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9:]/g, "");
}

function readFrontMatterDescription(text: string): string {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fm) return "";
  const m = /^description:\s*(.+)$/m.exec(fm[1]);
  return m ? m[1].trim().replace(/^["'>|]\s*|["']$/g, "") : "";
}

function stripFrontMatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/** One sentence (at most ~220 characters) from the description, else the Purpose section. */
export function purposeOf(text: string): string {
  let raw = readFrontMatterDescription(text);
  // A description that is only the command's own name says nothing; fall back to the body.
  if (raw === "" || /^[\w-]+$/.test(raw)) {
    const body = stripFrontMatter(text);
    const p = /^##\s+Purpose\s*\n+([^\n]+)/m.exec(body);
    if (p) raw = p[1].trim();
    else {
      const first = body.split("\n").map((l) => l.trim()).find((l) => l && !l.startsWith("#") && !l.startsWith(">") && !l.startsWith("---") && !l.startsWith("|") && !l.startsWith("```"));
      raw = first ? first.trim() : raw;
    }
  }
  raw = raw.replace(/^[\w-]+ — /, "").replace(/\s+/g, " ").trim();
  const sentence = /^(.{20,220}?[.!?])(\s|$)/.exec(raw);
  const out = sentence ? sentence[1] : raw.length > 220 ? `${raw.slice(0, 217).trimEnd()}…` : raw;
  return out;
}

/** The first code block under "## Usage", at most six lines. */
export function usageOf(text: string): string {
  const body = stripFrontMatter(text);
  const m = /^##\s+Usage\s*\n+```[a-z]*\n([\s\S]*?)```/m.exec(body);
  if (!m) return "";
  const lines = m[1]
    .replace(/\{\{ai_config_dir\}\}\//g, "/")
    .replace(/\{\{([\w-]+)\}\}/g, "<$1>")
    // Example paths are illustrations, and repository paths never go in the Customer edition.
    .replace(/\b(src|mcp-server|wxkanban-agent)\/[\w./-]*/g, "<path>")
    .split("\n").filter((l) => l.trim() && !l.trim().startsWith("#"));
  // A raw tool call is how the AI runs it, not something a person types; show nothing instead.
  if (lines.some((l) => /\bproject\.[a-z_]+\s*\(|\(\{/.test(l))) return "";
  return lines.slice(0, 6).join("\n");
}

function readText(file: string): string {
  // Strip a byte-order mark too: one hides a file's front matter from every parser here.
  return existsSync(file) ? readFileSync(file, "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n") : "";
}

/** Skills that are the implementation behind a slash command of another name. */
const SKILL_ALIASES: Readonly<Record<string, string>> = { wxpretest: "pretest" };

function rel(repo: string, file: string): string {
  return path.relative(repo, file).split(path.sep).join("/");
}

function listMarkdown(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...listMarkdown(full));
    else if (name.endsWith(".md")) out.push(full);
  }
  return out;
}

function shippedSkillNames(repo: string): string[] {
  const sync = readText(path.join(repo, "scripts", "sync-to-orchestrator.mjs"));
  const m = /CLAUDE_SKILLS_ALLOWLIST = new Set\(\[([\s\S]*?)\]\)/.exec(sync);
  const names = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]) : [];
  const kitSkills = path.join(repo, "_wxAI", "skills");
  if (existsSync(kitSkills)) {
    for (const d of readdirSync(kitSkills).sort()) {
      if (existsSync(path.join(kitSkills, d, "SKILL.md"))) names.push(d);
    }
  }
  return [...new Set(names)].sort();
}

function skillFile(repo: string, name: string): string | null {
  for (const base of [path.join(repo, "_wxAI", "skills"), path.join(repo, ".claude", "skills")]) {
    const f = path.join(base, name, "SKILL.md");
    if (existsSync(f)) return f;
  }
  return null;
}

const CLI_PURPOSE: Readonly<Record<string, string>> = {
  auditfences: "Checks that every code unit carries its scope and task fence.",
  "kit:status": "Shows the installed kit version and whether an update is waiting.",
  "kit:configure": "Sets the kit's connection to your wxKanban project.",
  "scaffold:frontend": "Scaffolds the frontend from the project's Stack & Style choices.",
  "archive:files": "Moves files to the project archive instead of deleting them.",
};

function readCli(repo: string): Array<{ name: string; handler: boolean }> {
  const adapter = readText(path.join(repo, "wxkanban-agent", "core", "policy", "adapters", "cli-adapter.ts"));
  const block = /CLI_COMMAND_TO_CAPABILITY[^=]*=\s*\{([\s\S]*?)\n\};/.exec(adapter);
  const names = block ? [...block[1].matchAll(/^\s*"?([A-Za-z:-]+)"?:\s*Capability\./gm)].map((m) => m[1]) : [];
  const engine = readText(path.join(repo, "wxkanban-agent", "core", "orchestrator", "workflow-engine.ts"));
  const handled = new Set([...engine.matchAll(/case '([A-Za-z:-]+)':/g)].map((m) => m[1].toLowerCase()));
  return names.sort().map((name) => ({ name, handler: handled.has(name.toLowerCase()) }));
}

/** Reads every command source in the repository into raw commands (no linking yet). */
export function readCommandSources(repo: string): RawCommand[] {
  const byKey = new Map<string, RawCommand>();
  const add = (cmd: RawCommand): void => {
    const prior = byKey.get(cmd.key);
    if (!prior) {
      byKey.set(cmd.key, cmd);
      return;
    }
    prior.invoke = [...new Set([...prior.invoke, ...cmd.invoke])];
    prior.scanText += `\n${cmd.scanText}`;
    prior.sources = [...new Set([...prior.sources, ...cmd.sources])].sort();
    if (!prior.purpose) prior.purpose = cmd.purpose;
    if (!prior.usage) prior.usage = cmd.usage;
    if (cmd.cliHandler !== null) prior.cliHandler = cmd.cliHandler;
  };

  // Slash commands: the kit copy, plus any that exist only in .claude/commands (preTest).
  const slashFiles = [
    ...listMarkdown(path.join(repo, "_wxAI", "commands")),
    ...listMarkdown(path.join(repo, ".claude", "commands")),
  ].filter((f) => path.dirname(f).endsWith("commands") && path.basename(f) !== "ENFORCEMENT_SUMMARY.md");
  const seenSlash = new Set<string>();
  for (const file of slashFiles) {
    const name = path.basename(file, ".md");
    const key = normalizeKey(name);
    if (seenSlash.has(key)) continue;
    seenSlash.add(key);
    const text = readText(file);
    add({ key, name, kind: "slash", invoke: [`/${name}`], purpose: purposeOf(text), usage: usageOf(text), scanText: stripFrontMatter(text), sources: [rel(repo, file)], cliHandler: null });
  }

  // Server-side steps for the commands whose local file is a stub.
  for (const file of listMarkdown(path.join(repo, "mcp-server", "src", "prompts"))) {
    const relative = rel(repo, file);
    const top = relative.split("/")[3] ?? "";
    const owner = top.endsWith(".md") ? top.slice(0, -3) : top;
    const key = normalizeKey(owner);
    const prior = byKey.get(key);
    if (!prior) continue;
    const text = readText(file);
    prior.scanText += `\n${stripFrontMatter(text)}`;
    prior.sources = [...new Set([...prior.sources, relative])].sort();
    if (!prior.usage) prior.usage = usageOf(text);
    if (!prior.purpose || /^Call the MCP tool|^The full methodology/.test(prior.purpose)) prior.purpose = purposeOf(text);
  }

  // Shipped skills.
  for (const name of shippedSkillNames(repo)) {
    const file = skillFile(repo, name);
    if (!file) continue;
    const text = readText(file);
    const alias = SKILL_ALIASES[normalizeKey(name)];
    if (alias && byKey.has(alias)) {
      add({ key: alias, name, kind: "skill", invoke: [], purpose: "", usage: "", scanText: stripFrontMatter(text), sources: [rel(repo, file)], cliHandler: null });
      continue;
    }
    add({ key: normalizeKey(name), name, kind: "skill", invoke: [`/${name}`], purpose: purposeOf(text), usage: usageOf(text), scanText: stripFrontMatter(text), sources: [rel(repo, file)], cliHandler: null });
  }

  // CLI commands, merged into the slash command of the same name when there is one.
  for (const { name, handler } of readCli(repo)) {
    const key = byKey.has(normalizeKey(name)) ? normalizeKey(name) : `cli:${normalizeKey(name)}`;
    add({ key, name: key.startsWith("cli:") ? `wxkanban-agent ${name}` : name, kind: "cli", invoke: [`wxkanban-agent ${name}`], purpose: CLI_PURPOSE[name] ?? "", usage: "", scanText: "", sources: ["wxkanban-agent/core/policy/adapters/cli-adapter.ts"], cliHandler: handler });
  }

  // Dev Cockpit palette commands.
  const pkgText = readText(path.join(repo, "vscode-extension", "package.json"));
  if (pkgText) {
    const pkg = JSON.parse(pkgText) as { contributes?: { commands?: Array<{ command: string; title: string }> } };
    for (const c of pkg.contributes?.commands ?? []) {
      const title = c.title.replace(/^wxKanban:\s*/, "");
      add({ key: `cockpit:${normalizeKey(c.command)}`, name: title, kind: "cockpit", invoke: [`Command Palette → ${c.title}`], purpose: `${title}.`, usage: "", scanText: "", sources: ["vscode-extension/package.json"], cliHandler: null });
    }
  }
  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}
// [SCOPE 141 / T003] END

// [SCOPE 141 / T004] BEGIN — Link detection, labels, called-by, exclusions and stages
const LABEL_RANK: Readonly<Record<LinkLabel, number>> = { Confirmed: 3, Likely: 2, Mention: 1 };

/** Claude Code built-ins and app words that look like slash commands but are not kit commands. */
const NOT_KIT_COMMANDS = new Set([
  "mcp", "clear", "resume", "init", "compact", "model", "config", "login", "logout", "doctor", "cost",
  "memory", "review", "agents", "permissions", "hooks", "ide", "status", "exit", "bug", "vim",
  "api", "docs", "manual", "faq", "dashboard", "projects", "tasks", "settings", "admin", "sysadmin",
  "health", "tmp", "dev", "usr", "etc", "bin", "home", "mnt", "c", "e", "s", "nightly",
]);

export const STAGE_MAP: Readonly<Record<string, string>> = {
  buildscope: "Design", validatescope: "Design", analyzescope: "Design", createspecs: "Design",
  research: "Design", buildstack: "Design", wxbrainstorm: "Design", wxgod: "Design",
  wxdesigner: "Design", wxbrand: "Design", scopeflowmap: "Design",
  implement: "Implementation", wxuiuxcodereview: "Implementation", wxconversionparity: "Implementation",
  analyzecode: "Implementation", dbpush: "Implementation", compliancescan: "Implementation",
  wxdbanalyze: "Implementation",
  wxcreatetestplan: "QA", pretest: "QA", autofixtests: "QA", testsweep: "QA",
  wxhelpgenerate: "Human Testing → Release",
  wxconversion: "Conversion", wxconversionscope: "Conversion", cwconversion: "Conversion",
  cwconversionscope: "Conversion", vbconversion: "Conversion", vbconversionscope: "Conversion",
};

export const STAGE_ORDER = ["Design", "Implementation", "QA", "Human Testing → Release", "Conversion", "Any stage"];

const RUN_VERB = /\b(run|runs|running|invoke|invokes|call|calls|execute|executes|launch|launches|delegat\w*|hands? (it )?(off )?to)\b/i;

/** Labels a reference from its line, the line before it, and the heading it sits under. */
function labelFor(line: string, previous: string, heading: string): LinkLabel {
  if (/related|see also|reference/i.test(heading)) return "Mention";
  if (/\bnever\b|\bdo not (run|use|call)\b|\bdon'?t (run|use|call)\b|\bdeprecated\b|\breplaced by\b/i.test(line)) return "Mention";
  if (/next step|what'?s next|hand-?off/i.test(heading)) return "Likely";
  if (/\bnext\b|then run|when (you'?re )?ready|afterwards?|follow-?up|suggest|offer|recommend/i.test(line)) return "Likely";
  if (RUN_VERB.test(line) || (RUN_VERB.test(previous) && /:\s*$/.test(previous.trim()))) return "Confirmed";
  if (/\b(phase|step)\b/i.test(heading)) return "Confirmed";
  return "Mention";
}

interface FoundRef {
  name: string;
  isCli: boolean;
  label: LinkLabel;
}

/** Every slash or CLI reference in a command's text, with the strongest label seen for each. */
export function findReferences(text: string): FoundRef[] {
  const best = new Map<string, FoundRef>();
  let heading = "";
  let inFence = false;
  let previous = "";
  for (const line of text.split("\n")) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h && !inFence) {
      heading = h[1];
      previous = "";
      continue;
    }
    const effective: LinkLabel = inFence && !/next|related/i.test(heading) ? "Confirmed" : labelFor(line, previous, heading);
    if (line.trim()) previous = line;
    for (const m of line.matchAll(/(?:^|[\s`(["'>*])\/([A-Za-z][A-Za-z0-9-]*[A-Za-z0-9])(?=[\s`)\].,:;"'!?*]|$)/g)) {
      const k = `slash:${normalizeKey(m[1])}`;
      const prior = best.get(k);
      if (!prior || LABEL_RANK[effective] > LABEL_RANK[prior.label]) best.set(k, { name: m[1], isCli: false, label: effective });
    }
    for (const m of line.matchAll(/wxkanban-agent\s+([a-z][a-z:-]*[a-z])/g)) {
      const k = `cli:${normalizeKey(m[1])}`;
      const prior = best.get(k);
      if (!prior || LABEL_RANK[effective] > LABEL_RANK[prior.label]) best.set(k, { name: m[1], isCli: true, label: effective });
    }
  }
  return [...best.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function idFor(raw: RawCommand): string {
  const slug = raw.key.replace(/:/g, "-").replace(/[^a-z0-9-]/g, "");
  return `cmd-${slug}`;
}

function runsIn(raw: RawCommand): string[] {
  const out: string[] = [];
  if (raw.invoke.some((i) => i.startsWith("/"))) out.push("AI slash command");
  if (raw.invoke.some((i) => i.startsWith("wxkanban-agent "))) out.push("Terminal (wxkanban-agent)");
  if (raw.kind === "cockpit") out.push("Dev Cockpit (Command Palette)");
  return out;
}

/** Links commands, inverts calls into called-by, applies exclusions and stages, and finds drift. */
export function buildModel(raws: RawCommand[], exclude: Readonly<Record<string, string>>): CommandModel {
  const byKey = new Map(raws.map((r) => [r.key, r]));
  const excludeByKey = new Map(Object.entries(exclude).map(([name, reason]) => [normalizeKey(name), reason]));
  const drift: DriftFinding[] = [];
  const entries: CommandEntry[] = raws.map((raw) => {
    let excludedReason = excludeByKey.get(raw.key) ?? null;
    if (raw.cliHandler === false && raw.kind === "cli") {
      excludedReason = excludedReason ?? "Listed by the CLI but has no handler, so it does not run.";
      drift.push({ kind: "no-handler", from: raw.name, target: raw.name, label: null, detail: "Registered in the CLI but the workflow engine has no handler for it." });
    }
    const stageKey = raw.key.replace(/^cli:/, "");
    const stage = STAGE_MAP[stageKey] ?? "Any stage";
    return {
      key: raw.key, id: idFor(raw), name: raw.kind === "slash" || raw.kind === "skill" ? `/${raw.name}` : raw.name,
      kind: raw.kind, runsIn: runsIn(raw), invoke: [...raw.invoke].sort(), purpose: raw.purpose, usage: raw.usage,
      stage, stageConfidence: "Likely", calls: [], calledBy: [],
      mcpTools: [...new Set([...raw.scanText.matchAll(/\bproject\.([a-z_]+)\b/g)].map((m) => `project.${m[1]}`))].sort(),
      sources: [...raw.sources].sort(), excluded: excludedReason !== null, excludedReason,
    };
  });
  const entryByKey = new Map(entries.map((e) => [e.key, e]));

  for (const raw of raws) {
    const from = entryByKey.get(raw.key);
    if (!from) continue;
    for (const ref of findReferences(raw.scanText)) {
      const norm = normalizeKey(ref.name);
      const targetKey = ref.isCli ? (byKey.has(norm) ? norm : `cli:${norm}`) : norm;
      if (targetKey === raw.key) continue;
      const target = entryByKey.get(targetKey);
      if (!target) {
        if (!ref.isCli && NOT_KIT_COMMANDS.has(norm)) continue;
        if (ref.label === "Mention" || from.excluded) continue;
        // Only names shaped like kit commands count; bare words are usually path pieces.
        if (!ref.isCli && (!/-|^wx/i.test(ref.name) || ref.name === ref.name.toUpperCase())) continue;
        drift.push({ kind: "missing-command", from: from.name, target: ref.isCli ? `wxkanban-agent ${ref.name}` : `/${ref.name}`, label: ref.label, detail: "Referenced as a step or next step, but no such command exists." });
        continue;
      }
      from.calls.push({ target: target.key, label: ref.label });
      target.calledBy.push({ target: from.key, label: ref.label });
      if (!from.excluded && target.excluded && ref.label !== "Mention") {
        drift.push({ kind: "references-retired", from: from.name, target: target.name, label: ref.label, detail: target.excludedReason ?? "" });
      }
    }
  }
  const byLabelThenName = (a: CommandLink, b: CommandLink): number =>
    LABEL_RANK[b.label] - LABEL_RANK[a.label] || a.target.localeCompare(b.target);
  for (const e of entries) {
    e.calls.sort(byLabelThenName);
    e.calledBy.sort(byLabelThenName);
  }
  drift.sort((a, b) => a.kind.localeCompare(b.kind) || a.from.localeCompare(b.from) || a.target.localeCompare(b.target));
  const unique = drift.filter((d, i) => i === 0 || JSON.stringify(d) !== JSON.stringify(drift[i - 1]));
  return { entries: entries.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.key.localeCompare(b.key)), drift: unique };
}
// [SCOPE 141 / T004] END

// [SCOPE 141 / T005] BEGIN — Render command pages, indexes, drift pages and commands.json
const LABEL_TEXT: Readonly<Record<LinkLabel, string>> = {
  Confirmed: "Runs it as one of its steps",
  Likely: "Suggests it as a next step",
  Mention: "Mentions it as related",
};

function frontMatter(id: string, audience: "customer" | "internal", sources: string[]): string {
  return ["---", `id: ${id}`, "part: command-reference", `audience: ${audience}`, `sources: ${sources.join(", ")}`, "generated: true", "---", ""].join("\n");
}

function linkTable(links: CommandLink[], byKey: Map<string, CommandEntry>, customer: boolean): string[] {
  const rows = links
    .map((l) => ({ l, e: byKey.get(l.target) }))
    .filter((x): x is { l: CommandLink; e: CommandEntry } => x.e !== undefined && (!customer || !x.e.excluded));
  if (rows.length === 0) return ["None."];
  return ["| Command | How |", "|---|---|", ...rows.map(({ l, e }) => `| [${e.name}](${e.id}.md) | ${LABEL_TEXT[l.label]} |`)];
}

function commandPage(e: CommandEntry, byKey: Map<string, CommandEntry>): string {
  const lines = [frontMatter(e.id, e.excluded ? "internal" : "customer", e.sources), `# ${e.name}`, ""];
  if (e.excluded) lines.push(`> **Not in the Customer edition.** ${e.excludedReason ?? ""}`, "");
  lines.push(e.purpose || "No description is recorded for this command yet.", "");
  lines.push("| | |", "|---|---|");
  lines.push(`| **Runs in** | ${e.runsIn.join(" · ") || "—"} |`);
  lines.push(`| **How to start it** | ${e.invoke.map((i) => `\`${i}\``).join(" · ")} |`);
  lines.push(`| **Stage** | ${e.stage} |`, "");
  if (e.usage) lines.push("## How to run it", "", "```text", e.usage, "```", "");
  lines.push("## What it calls", "", ...linkTable(e.calls, byKey, !e.excluded), "");
  lines.push("## What calls it", "", ...linkTable(e.calledBy, byKey, !e.excluded), "");
  const internal: string[] = [];
  internal.push(`**Read from:** ${e.sources.map((s) => `\`${s}\``).join(", ")}`, "");
  internal.push(`**Stage confidence:** ${e.stageConfidence} (from the generator's stage map until the command declares its own)`, "");
  if (e.mcpTools.length) internal.push(`**MCP tools it uses:** ${e.mcpTools.map((t) => `\`${t}\``).join(", ")}`, "");
  const retired = e.calls.filter((l) => byKey.get(l.target)?.excluded);
  if (retired.length) internal.push(`**Points at retired commands:** ${retired.map((l) => byKey.get(l.target)?.name ?? l.target).join(", ")}`, "");
  if (!e.excluded) lines.push(":::internal", ...internal, ":::", "");
  else lines.push(...internal);
  return lines.join("\n");
}

function indexPage(id: string, title: string, intro: string, groups: Array<[string, CommandEntry[]]>): string {
  const lines = [frontMatter(id, "customer", ["docs-workspace/tooling/manual/command-reference.mts"]), `# ${title}`, "", intro, ""];
  for (const [heading, list] of groups) {
    if (list.length === 0) continue;
    lines.push(`## ${heading}`, "", "| Command | What it does |", "|---|---|");
    for (const e of list) lines.push(`| [${e.name}](${e.id}.md) | ${e.purpose.replace(/\|/g, "/")} |`);
    lines.push("");
  }
  return lines.join("\n");
}

/** All generated section files (file name → content) plus the commands.json registry text. */
export function renderReference(model: CommandModel): { files: Map<string, string>; registry: string } {
  const byKey = new Map(model.entries.map((e) => [e.key, e]));
  const shown = model.entries.filter((e) => !e.excluded);
  const files = new Map<string, string>();
  for (const e of model.entries) files.set(`${e.id}.md`, commandPage(e, byKey));

  files.set("commands-by-stage.md", indexPage("commands-by-stage", "Commands by stage",
    "Which commands you use at each stage of a scope.",
    STAGE_ORDER.map((s) => [s, shown.filter((e) => e.stage === s)])));
  files.set("commands-a-z.md", indexPage("commands-a-z", "Commands A–Z", "Every command in the kit, alphabetically.",
    [["All commands", shown]]));
  const where: Array<[string, CommandEntry[]]> = [
    ["In your AI (slash commands)", shown.filter((e) => e.runsIn.includes("AI slash command"))],
    ["In the terminal (wxkanban-agent)", shown.filter((e) => e.runsIn.includes("Terminal (wxkanban-agent)"))],
    ["In the Dev Cockpit (Command Palette)", shown.filter((e) => e.kind === "cockpit")],
  ];
  files.set("commands-by-where.md", indexPage("commands-by-where", "Commands by where they run", "Where you start each command.", where));

  const drift = [frontMatter("known-drift", "internal", ["docs-workspace/tooling/manual/command-reference.mts"]), "# Known drift", "",
    "Generated on every build: references to commands that do not exist, CLI commands with no handler, and live commands that still point at retired ones.", ""];
  const kinds: Array<[DriftFinding["kind"], string]> = [["missing-command", "References to commands that do not exist"], ["no-handler", "CLI commands with no handler"], ["references-retired", "Live commands that point at retired commands"]];
  for (const [kind, title] of kinds) {
    const list = model.drift.filter((d) => d.kind === kind);
    drift.push(`## ${title} (${list.length})`, "");
    if (list.length === 0) drift.push("None.", "");
    else drift.push("| From | Target | How sure | Detail |", "|---|---|---|---|", ...list.map((d) => `| ${d.from} | ${d.target} | ${d.label ?? "—"} | ${d.detail.replace(/\|/g, "/")} |`), "");
  }
  files.set("known-drift.md", drift.join("\n"));

  const excluded = model.entries.filter((e) => e.excluded);
  files.set("not-in-this-manual.md", [frontMatter("not-in-this-manual", "internal", ["docs-workspace/tooling/manual/exclude.json"]), "# Not in this Manual", "",
    "Commands that are still installed but are not documented in the Customer edition, with the reason.", "",
    "| Command | Reason |", "|---|---|", ...excluded.map((e) => `| [${e.name}](${e.id}.md) | ${(e.excludedReason ?? "").replace(/\|/g, "/")} |`), ""].join("\n"));

  const registry = JSON.stringify({ generatedBy: "docs-workspace/tooling/manual/command-reference.mts", entries: model.entries, drift: model.drift }, null, 2) + "\n";
  return { files, registry };
}
// [SCOPE 141 / T005] END
