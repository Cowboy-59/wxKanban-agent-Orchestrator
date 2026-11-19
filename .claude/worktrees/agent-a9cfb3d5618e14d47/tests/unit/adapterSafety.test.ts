// SCOPE-127 / T006, T007, T008 — the guards that carry the safety burden.
//
// SCOPE-127 makes the pipeline MORE permissive: an unmatched stack generates its own adapter and
// proceeds automatically, with no human approving it. That moves safety off a person and onto
// machine-checkable guards. These are those guards, so the tests here are the ones that must not
// be weakened — every one asserts a REFUSAL.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import {
  BoundaryRefusal,
  UNVERIFIED_POSTURES,
  assertInsideBoundary,
  containerBoundary,
  fileBoundary,
  makeBoundary,
  schemaBoundary,
} from "../../_wxAI/adapters/posture-boundary.mjs";
import {
  MIN_FRAME_BYTES,
  describeVerdict,
  judgeProof,
} from "../../_wxAI/adapters/ui-driver-proof.mjs";
import { listAdapterFiles, validateAdapter } from "../../_wxAI/adapters/validate-adapter.mjs";

const temps: string[] = [];
function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), "adapter-safety-"));
  temps.push(d);
  return d;
}
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

describe("T006 — the schema posture refuses writes outside its boundary", () => {
  const b = schemaBoundary("wxktest_");

  it("allows a target inside the boundary", () => {
    expect(b.check("wxktest_119_ab12").allowed).toBe(true);
  });

  it("REFUSES public, which is production on a shared instance", () => {
    const v = b.check("public");
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain("production schema");
  });

  it("REFUSES any schema without the prefix", () => {
    expect(b.check("wxkanban").allowed).toBe(false);
    expect(b.check("test_119").allowed).toBe(false);
    expect(b.check("").allowed).toBe(false);
  });

  it("rejects an empty prefix outright, because it would admit everything", () => {
    expect(() => schemaBoundary("")).toThrow(/admits public/i);
    expect(() => schemaBoundary("   ")).toThrow();
  });
});

describe("T006 — the file posture holds on a stack with no database server", () => {
  const dir = "/srv/app/.wxai/disposable";
  const b = fileBoundary(dir);

  it("allows a file inside the directory", () => {
    expect(b.check("scope-119.sqlite").allowed).toBe(true);
    expect(b.check(join(dir, "scope-119.sqlite")).allowed).toBe(true);
  });

  it("REFUSES a path that escapes via ..", () => {
    // A string-prefix check would allow this. Containment is decided after resolving.
    const v = b.check("../../../etc/app.db");
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain("escapes");
  });

  it("REFUSES an absolute path outside the directory", () => {
    expect(b.check("/var/lib/production.db").allowed).toBe(false);
  });

  it("REFUSES the boundary directory itself as a target", () => {
    expect(b.check(dir).allowed).toBe(false);
  });

  it("rejects an empty directory outright", () => {
    expect(() => fileBoundary("")).toThrow(/every path is inside/i);
  });
});

describe("T006 — the container posture is expressible but unverified", () => {
  it("is recorded as unverified rather than quietly shipped", () => {
    expect(UNVERIFIED_POSTURES.has("container")).toBe(true);
  });

  it("REFUSES everything, rather than admitting everything", () => {
    // An unverified posture that allowed writes would be worse than one that does not exist:
    // a run would proceed on a guarantee nobody has checked.
    const b = containerBoundary("pg-test-1");
    const v = b.check("anything-at-all");
    expect(v.allowed).toBe(false);
    expect(v.reason).toContain("never been proven");
  });
});

describe("T006 — refusal is the posture's job, not a caller's convention", () => {
  it("throws a named refusal carrying posture, boundary and target", () => {
    try {
      assertInsideBoundary("schema", "wxktest_", "public");
      throw new Error("should have refused");
    } catch (err) {
      expect(err).toBeInstanceOf(BoundaryRefusal);
      const r = err as InstanceType<typeof BoundaryRefusal>;
      expect(r.posture).toBe("schema");
      expect(r.boundary).toBe("wxktest_");
      expect(r.target).toBe("public");
    }
  });

  it("passes silently when the target is inside", () => {
    expect(assertInsideBoundary("schema", "wxktest_", "wxktest_9")).toBe(true);
  });

  it("rejects an unknown posture rather than defaulting to a permissive one", () => {
    expect(() => makeBoundary("whatever", "x")).toThrow(/Unknown posture/);
  });
});

describe("T007 — no adapter may decline to drive the UI", () => {
  const section = (h: string) =>
    `## ${h}\n\nA complete and specific answer for this stack, long enough to be a real answer and not a stub.\n\n`;

  function adapterWith(uiBody: string): string {
    const d = scratch();
    const p = join(d, "candidate.md");
    writeFileSync(
      p,
      "# Adapter — candidate\n\n" +
        section("Inventory source") +
        section("Schema source") +
        section("Harness") +
        `## UI driver\n\n${uiBody}\n\n` +
        section("DB posture") +
        "## Test substitutes\n\nAn in-memory store stands in for the database. It **cannot** enforce " +
        "foreign keys, so assertions about them are unfailable against it.\n",
      "utf-8",
    );
    return p;
  }

  it("FAILS an adapter that declares no automated driver", () => {
    // Owner decision 4: the human-walkthrough fallback was proposed and rejected, because an
    // opt-out is the path every unfamiliar stack would take and the gate would stop existing.
    const r = validateAdapter(
      adapterWith("There is no automated driver for this stack; the UI is checked by a human walkthrough."),
    );
    expect(r.valid).toBe(false);
    expect(r.failures.find((f) => f.id === "ui")?.problem).toBe("declined-driver");
  });

  it("FAILS an adapter that describes a driver but names nothing executable", () => {
    const r = validateAdapter(
      adapterWith("The user interface is exercised thoroughly by the team during each release cycle."),
    );
    expect(r.valid).toBe(false);
    expect(r.failures.find((f) => f.id === "ui")?.problem).toBe("no-executable");
  });

  it("accepts an adapter naming a real executable driver", () => {
    const r = validateAdapter(
      adapterWith("Playwright drives the running client and captures a trace per step for evidence."),
    );
    expect(r.valid).toBe(true);
  });

  it("both shipped adapters name an executable driver", () => {
    for (const f of listAdapterFiles(process.cwd())) {
      const r = validateAdapter(f);
      expect(r.valid, `${r.name}: ${r.unanswered.join(", ")}`).toBe(true);
    }
  });
});

describe("T008 — a UI result requires proof that something was driven", () => {
  const ctx = { adapter: "generated-acme", driver: "acme-ui-runner" };

  it("accepts a booted target with a real element tree", () => {
    const v = judgeProof({ booted: true, target: "http://localhost:5173", elementCount: 42 }, ctx);
    expect(v.accepted).toBe(true);
    expect(v.evidence).toContain("element tree");
  });

  it("accepts a booted target with a real captured frame", () => {
    const v = judgeProof({ booted: true, frameBytes: MIN_FRAME_BYTES + 1 }, ctx);
    expect(v.accepted).toBe(true);
  });

  it("REFUSES a driver that launched nothing — the fabricated-driver case", () => {
    // A generated adapter must invent a driver for an unanticipated stack. This is the only thing
    // between that and a false green.
    const v = judgeProof({ booted: false, elementCount: 0 }, ctx);
    expect(v.accepted).toBe(false);
    expect(v.consequence).toContain("NO UI-tier result");
    expect(v.consequence).toContain("hard stop");
  });

  it("REFUSES a truthy string standing in for a boolean", () => {
    // A driver nobody ran can still return "true".
    const v = judgeProof({ booted: "true", elementCount: 10 }, ctx);
    expect(v.accepted).toBe(false);
    expect(v.reasons.join(" ")).toContain("boolean true");
  });

  it("REFUSES a non-numeric element count", () => {
    const v = judgeProof({ booted: true, elementCount: "many" }, ctx);
    expect(v.accepted).toBe(false);
  });

  it("REFUSES a booted target that rendered nothing", () => {
    const v = judgeProof({ booted: true, elementCount: 0, frameBytes: 0 }, ctx);
    expect(v.accepted).toBe(false);
  });

  it("REFUSES a frame too small to be an image of anything", () => {
    expect(judgeProof({ booted: true, frameBytes: 12 }, ctx).accepted).toBe(false);
  });

  it("REFUSES an empty or absent probe entirely", () => {
    for (const bad of [null, undefined, {}, "ok", 1]) {
      expect(judgeProof(bad as never, ctx).accepted).toBe(false);
    }
  });

  it("names the adapter, the declared driver and what the probe actually returned", () => {
    const v = judgeProof({ booted: false, elementCount: 0 }, ctx);
    const text = describeVerdict(v);
    expect(text).toContain("generated-acme");
    expect(text).toContain("acme-ui-runner");
    expect(text).toContain("booted=false");
    expect(text).toContain("elementCount=0");
  });

  it("is deterministic — a fabricated driver fails EVERY run, never one green among them", () => {
    // The acceptance is explicit: any single green run fails this outright.
    const fabricated = { booted: true, elementCount: 0, frameBytes: 0, driver: "launches-nothing" };
    const verdicts = Array.from({ length: 50 }, () => judgeProof(fabricated, ctx).accepted);
    expect(verdicts.every((v) => v === false)).toBe(true);
    expect(new Set(verdicts).size).toBe(1);
  });

  it("states the consequence on an acceptance too, so a refusal cannot be read as a skip", () => {
    expect(judgeProof({ booted: true, elementCount: 5 }, ctx).consequence).toContain("may be recorded");
  });
});
