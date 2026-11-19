// SPEC-142 / T018 — global tier: parsing, project-detail check, cross-repo rule.
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkGlobal,
  defaultGodLearningsPath,
  findProjectDetail,
  globalSource,
  parseGodLearnings,
  readableLedgerRoots,
  readableNamespaces,
} from "../../../_wxAI/askgate/global.mjs";
import { repoNamespace } from "../../../_wxAI/askgate/openviking.mjs";

const SAMPLE = `# Title

Intro text.

## Sign-in and accounts

- **Pattern:** Web sign-in offers a password, or single sign-on with an existing Google
  account.
  - **Chosen:** 1 · **Last:** 2026-10-03
- **Pattern:** Every web sign-up confirms its email address.
  - **Chosen:** 1

## Email

- **Pattern:** Send mail from a verified domain.
`;

describe("parseGodLearnings", () => {
  const e = parseGodLearnings(SAMPLE);
  it("parses topics, ids and wrapped text", () => {
    expect(e).toHaveLength(3);
    expect(e[0]).toMatchObject({ id: "G-0001", tier: "global", topic: "Sign-in and accounts" });
    expect(e[0].text).toBe("Web sign-in offers a password, or single sign-on with an existing Google account.");
    expect(e[2]).toMatchObject({ id: "G-0003", topic: "Email" });
  });
  it("does not leak the Chosen sub-bullet into text", () => {
    expect(e.every((x: { text: string }) => !x.text.includes("Chosen"))).toBe(true);
  });
});

describe("findProjectDetail", () => {
  it("flags scope, spec, email, paths and project names", () => {
    const kinds = (t: string) => findProjectDetail(t).map((h: { kind: string }) => h.kind);
    expect(kinds("see SCOPE-142 for it")).toContain("scope-number");
    expect(kinds("per SPEC-12")).toContain("spec-number");
    expect(kinds("ask andy@wxperts.com")).toContain("email");
    expect(kinds("in E:\\AI_Development\\x")).toContain("windows-path");
    expect(kinds("edit src/db/schema.ts now")).toContain("file-path");
    expect(kinds("under ~/.wxai/notes")).toContain("home-path");
    expect(kinds("the wxKanban app")).toContain("project-name");
    expect(findProjectDetail("the Acme app", ["Acme"]).map((h: { kind: string }) => h.kind)).toContain("project-name");
  });
  it("leaves general patterns alone", () => {
    for (const t of [
      "Every web sign-up confirms its email address.",
      "Use pass/fail and/or skip states for tests.",
      "Rates apply per day, e.g. 3.5 percent.",
    ]) expect(findProjectDetail(t)).toEqual([]);
  });
});

describe("globalSource", () => {
  const src = globalSource({ entries: parseGodLearnings(SAMPLE) });
  it("searches entries by overlap, best first", () => {
    const r = src.search("does sign-up confirm email address");
    expect(r[0].id).toBe("G-0002");
    expect(r[0].tier).toBe("global");
    expect(r[0].text).toContain("sign-up");
  });
  it("returns nothing for unrelated queries", () => {
    expect(src.search("zebra quantum")).toEqual([]);
  });
});

describe("cross-repo rule", () => {
  it("without links a repo sees only itself plus global", () => {
    expect(readableLedgerRoots("/r/a", { links: [] })).toEqual(["/r/a"]);
    expect(readableLedgerRoots("/r/a", undefined)).toEqual(["/r/a"]);
    expect(readableNamespaces("/r/a", { links: [] })).toEqual([repoNamespace("/r/a"), "global"]);
  });
  it("only an explicit link adds another repo", () => {
    expect(readableLedgerRoots("/r/a", { links: ["/r/b"] })).toEqual(["/r/a", "/r/b"]);
    expect(readableNamespaces("/r/a", { links: ["/r/b"] })).toContain(repoNamespace("/r/b"));
    expect(readableNamespaces("/r/a", { links: [] })).not.toContain(repoNamespace("/r/b"));
  });
});

describe("seed: real god-learnings (read-only)", () => {
  const path = defaultGodLearningsPath();
  it.skipIf(!existsSync(path))("parses and checks without throwing", () => {
    const entries = parseGodLearnings(readFileSync(path, "utf8"));
    const flagged = checkGlobal(entries);
    expect(entries.length).toBeGreaterThan(0);
    process.stderr.write(`seed: ${entries.length} entries, ${flagged.length} flagged at lines ${flagged.map((f: { line: number }) => f.line).join(",")}\n`);
    expect(path).toBe(join(homedir(), ".wxai", "god-learnings.md"));
  });
});
