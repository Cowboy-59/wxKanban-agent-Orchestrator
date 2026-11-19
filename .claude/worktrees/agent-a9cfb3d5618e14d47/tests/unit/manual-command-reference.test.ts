// [SCOPE 141 / T006] BEGIN — Fixture tests for the Manual generator, editions and release checks
import { describe, expect, it } from "vitest";
import { buildModel, findReferences, renderReference, type RawCommand } from "../../docs-workspace/tooling/manual/command-reference.mjs";
import { checkCommandMentions, scanForLeaks, unsafeOutputReason } from "../../docs-workspace/tooling/manual/checks.mjs";
import { composeEdition, parseSection, validateIds } from "../../docs-workspace/tooling/manual/sections.mjs";

function raw(name: string, scanText: string, extra: Partial<RawCommand> = {}): RawCommand {
  return {
    key: name.toLowerCase().replace(/[^a-z0-9:]/g, ""),
    name,
    kind: "slash",
    invoke: [`/${name}`],
    purpose: `${name} does its job.`,
    usage: "",
    scanText,
    sources: [`_wxAI/commands/${name}.md`],
    cliHandler: null,
    ...extra,
  };
}

const FIXTURE: RawCommand[] = [
  raw("alpha", [
    "## Phase 1: Review",
    "Run `/beta` on the changes.",
    "Run `/ghost-command` on the result.",
    "Use `/old-thing` for the legacy flow.",
    "## Next Steps",
    "1. Then run `/gamma` when ready.",
    "## Related Commands",
    "- `/delta` — see also",
  ].join("\n")),
  raw("beta", "Never run `/old-thing`; it is replaced by `/alpha`."),
  raw("gamma", ""),
  raw("delta", ""),
  raw("old-thing", "Run `/beta` first."),
  raw("runqa", "", { key: "cli:runqa", name: "wxkanban-agent runqa", kind: "cli", invoke: ["wxkanban-agent runqa"], cliHandler: false }),
];
const EXCLUDE = { "old-thing": "Replaced by /alpha." };

describe("Command Reference generator", () => {
  const model = buildModel(FIXTURE, EXCLUDE);
  const byKey = new Map(model.entries.map((e) => [e.key, e]));

  it("labels links Confirmed, Likely and Mention by context", () => {
    const calls = new Map(byKey.get("alpha")?.calls.map((c) => [c.target, c.label]));
    expect(calls.get("beta")).toBe("Confirmed");
    expect(calls.get("gamma")).toBe("Likely");
    expect(calls.get("delta")).toBe("Mention");
  });

  it("treats a 'never run' line as a mention, not a call", () => {
    const calls = new Map(byKey.get("beta")?.calls.map((c) => [c.target, c.label]));
    expect(calls.get("oldthing")).toBe("Mention");
  });

  it("inverts calls into called-by", () => {
    expect(byKey.get("beta")?.calledBy.map((c) => c.target)).toEqual(expect.arrayContaining(["alpha", "oldthing"]));
  });

  it("excludes listed commands and CLI commands with no handler", () => {
    expect(byKey.get("oldthing")?.excluded).toBe(true);
    expect(byKey.get("cli:runqa")?.excluded).toBe(true);
    expect(byKey.get("alpha")?.excluded).toBe(false);
  });

  it("reports drift: missing commands, missing handlers, live commands pointing at retired ones", () => {
    const kinds = model.drift.map((d) => `${d.kind}:${d.target}`);
    expect(kinds).toContain("missing-command:/ghost-command");
    expect(kinds).toContain("no-handler:wxkanban-agent runqa");
    expect(kinds).toContain("references-retired:/old-thing");
  });

  it("keeps excluded commands out of customer pages and indexes", () => {
    const { files } = renderReference(model);
    expect(files.get("cmd-alpha.md")).not.toContain("/old-thing](");
    expect(files.get("commands-a-z.md")).not.toContain("/old-thing");
    expect(files.get("cmd-oldthing.md")).toContain("audience: internal");
    expect(files.get("cmd-alpha.md")).toContain(":::internal");
  });

  it("is deterministic: the same input renders byte-identical output", () => {
    const a = renderReference(buildModel(FIXTURE, EXCLUDE));
    const b = renderReference(buildModel([...FIXTURE].reverse(), EXCLUDE));
    expect(a.registry).toBe(b.registry);
    expect([...a.files.entries()].sort()).toEqual([...b.files.entries()].sort());
  });

  it("finds CLI references", () => {
    expect(findReferences("Run `wxkanban-agent dbpush --dry-run`.").map((r) => r.name)).toEqual(["dbpush"]);
  });
});

describe("Editions", () => {
  const customer = parseSection("---\nid: a\naudience: customer\n---\n# A\nShown.\n:::internal\nSecret detail.\n:::\nAfter.\n", "a.md");
  const untagged = parseSection("---\nid: b\n---\n# B\n", "b.md");
  const noId = parseSection("# C\n", "c.md");

  it("fails closed: untagged sections stay out of the Customer edition", () => {
    expect(composeEdition([customer, untagged], "customer").map((s) => s.meta.id)).toEqual(["a"]);
    expect(composeEdition([customer, untagged], "internal").map((s) => s.meta.id)).toEqual(["a", "b"]);
  });

  it("drops :::internal blocks from the Customer edition and marks them in the Internal one", () => {
    expect(composeEdition([customer], "customer")[0].body).not.toContain("Secret detail");
    expect(composeEdition([customer], "internal")[0].body).toContain("> **Internal only**");
  });

  it("rejects a section with no id", () => {
    expect(validateIds([customer, noId])).toEqual(["c.md: missing front matter id"]);
  });
});

describe("Release checks", () => {
  it("catches a planted secret", () => {
    const hits = scanForLeaks("x.html", "<p>The local .env holds DATABASE_URL=postgres://u:p@h/db and sk_live_abcdefghijkl</p>");
    expect(hits.map((h) => h.rule)).toEqual(expect.arrayContaining(["env file", "DATABASE_URL", "connection string", "Stripe key"]));
  });

  it("allows example.com addresses and flags real ones", () => {
    expect(scanForLeaks("x.html", "<p>jane@example.com</p>")).toEqual([]);
    expect(scanForLeaks("x.html", "<p>someone@realcompany.io</p>").map((h) => h.rule)).toEqual(["email address"]);
  });

  it("refuses Internal output under public/ or _wxAI/", () => {
    expect(unsafeOutputReason("/repo/public/manual-internal", "/repo")).not.toBeNull();
    expect(unsafeOutputReason("/repo/_wxAI/manual", "/repo")).not.toBeNull();
    expect(unsafeOutputReason("/repo/docs-workspace/build/internal", "/repo")).toBeNull();
  });

  it("flags retired and unknown commands in customer text, but not app routes", () => {
    const live = new Set(["buildscope"]);
    const retired = new Map([["wxaiqa", "Does not run."]]);
    const problems = checkCommandMentions("p.md", "Run `/buildscope`, not `/wxAI-qa` or `/scope-validate`. Open `/projects` in the app.", live, retired, new Set(["projects"]));
    expect(problems.map((p) => p.name)).toEqual(["/wxAI-qa", "/scope-validate"]);
  });
});
// [SCOPE 141 / T006] END
