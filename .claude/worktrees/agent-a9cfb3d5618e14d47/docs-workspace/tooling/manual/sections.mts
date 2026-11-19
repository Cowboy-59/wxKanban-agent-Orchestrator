// Manual sections: front matter, editions, and part pages (SCOPE-141).
// A section is a Markdown file under docs-workspace/sections/ whose front matter names its
// fixed id (the /manual URL path), its audience and the files it describes.

// [SCOPE 141 / T001] BEGIN — Section front matter types and parser
export type Audience = "customer" | "internal";
export type Edition = "customer" | "internal";

export interface SectionMeta {
  id: string | null;
  part: string | null;
  audience: Audience;
  audienceDeclared: boolean;
  sources: string[];
  generated: boolean;
}

export interface ManualSection {
  meta: SectionMeta;
  body: string;
  file: string;
}

const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export function parseSection(text: string, file: string): ManualSection {
  const normalized = text.replace(/\r\n/g, "\n");
  const meta: SectionMeta = {
    id: null,
    part: null,
    audience: "internal",
    audienceDeclared: false,
    sources: [],
    generated: false,
  };
  let body = normalized;
  if (normalized.startsWith("---\n")) {
    const end = normalized.indexOf("\n---", 4);
    if (end !== -1) {
      const block = normalized.slice(4, end);
      body = normalized.slice(end + 4).replace(/^\n+/, "");
      for (const line of block.split("\n")) {
        const m = /^([a-z]+):\s*(.*)$/.exec(line.trim());
        if (!m) continue;
        const key = m[1];
        const value = m[2].trim().replace(/^["']|["']$/g, "");
        if (key === "id") meta.id = value || null;
        else if (key === "part") meta.part = value || null;
        else if (key === "audience") {
          if (value === "customer" || value === "internal") {
            meta.audience = value;
            meta.audienceDeclared = true;
          }
        } else if (key === "sources") {
          meta.sources = value
            .replace(/^\[|\]$/g, "")
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s.length > 0);
        } else if (key === "generated") meta.generated = value === "true";
      }
    }
  }
  return { meta, body, file };
}

export function sectionTitle(section: ManualSection): string {
  const m = /^#\s+(.+)$/m.exec(section.body);
  return m ? m[1].trim() : (section.meta.id ?? section.file);
}

/** Every section needs a valid, unique id; returns the problems found (empty = valid). */
export function validateIds(sections: ManualSection[]): string[] {
  const problems: string[] = [];
  const seen = new Map<string, string>();
  for (const s of sections) {
    if (!s.meta.id) {
      problems.push(`${s.file}: missing front matter id`);
      continue;
    }
    if (!ID_PATTERN.test(s.meta.id)) problems.push(`${s.file}: id "${s.meta.id}" must be lowercase letters, digits and hyphens`);
    const prior = seen.get(s.meta.id);
    if (prior) problems.push(`${s.file}: id "${s.meta.id}" is already used by ${prior}`);
    else seen.set(s.meta.id, s.file);
  }
  return problems;
}
// [SCOPE 141 / T001] END

// [SCOPE 141 / T002] BEGIN — Edition filter (fail closed) and internal blocks
const INTERNAL_BLOCK = /^:::internal[^\n]*\n([\s\S]*?)^:::[ \t]*$\n?/gm;

/** Customer: drop :::internal blocks. Internal: keep them, shown as a marked callout. */
export function applyInternalBlocks(body: string, edition: Edition): string {
  if (edition === "customer") return body.replace(INTERNAL_BLOCK, "");
  return body.replace(INTERNAL_BLOCK, (_all: string, inner: string) => {
    const lines = inner.replace(/\n+$/, "").split("\n");
    return ["> **Internal only**", ">", ...lines.map((l) => (l ? `> ${l}` : ">"))].join("\n") + "\n";
  });
}

/** A section belongs to the Customer edition only when it is explicitly tagged customer. */
export function inEdition(section: ManualSection, edition: Edition): boolean {
  if (edition === "internal") return true;
  return section.meta.audienceDeclared && section.meta.audience === "customer";
}

export function composeEdition(sections: ManualSection[], edition: Edition): ManualSection[] {
  return sections
    .filter((s) => inEdition(s, edition))
    .map((s) => ({ ...s, body: applyInternalBlocks(s.body, edition) }));
}
// [SCOPE 141 / T002] END

// [SCOPE 141 / T001] BEGIN — Manual parts from config.json
export interface PartGroup {
  title: string;
  sections: string[];
}

export interface ManualPart {
  id: string;
  title: string;
  intro: string;
  groups: PartGroup[];
}

/** "@reference" in a group stands for every generated command page (cmd-*), alphabetically. */
function expandGroup(ids: string[], available: Set<string>): string[] {
  return ids.flatMap((id) => (id === "@reference" ? [...available].filter((a) => a.startsWith("cmd-")).sort() : [id]));
}

/** Section ids in reading order for one edition: each part page, then its sections. */
export function orderSections(parts: ManualPart[], available: Set<string>): string[] {
  const order: string[] = [];
  for (const part of parts) {
    const ids = part.groups.flatMap((g) => expandGroup(g.sections, available)).filter((id) => available.has(id));
    if (ids.length === 0) continue;
    order.push(`part-${part.id}`);
    order.push(...ids);
  }
  return order;
}

/** A synthesized landing page per part, listing only the sections present in this edition. */
export function partPage(part: ManualPart, byId: Map<string, ManualSection>): string {
  const lines = [`# ${part.title}`, "", part.intro, ""];
  for (const group of part.groups) {
    // The command pages are reached through the generated indexes, not listed here.
    const present = group.sections.filter((id) => id !== "@reference" && byId.has(id));
    if (present.length === 0) continue;
    if (group.title) lines.push(`## ${group.title}`, "");
    for (const id of present) {
      const s = byId.get(id);
      if (s) lines.push(`- [${sectionTitle(s)}](${id}.md)`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
// [SCOPE 141 / T001] END
