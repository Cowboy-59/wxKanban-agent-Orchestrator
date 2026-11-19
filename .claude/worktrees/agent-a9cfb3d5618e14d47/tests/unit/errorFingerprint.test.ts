import { describe, it, expect } from "vitest";
import { computeErrorFingerprint } from "~/server/lib/errorFingerprint";

// [SCOPE 061] FR-004 — fingerprint must be deterministic, ignore occurrence-specific
// noise (ids/line:col/paths/numbers), and distinguish genuinely different errors.
// [SCOPE 110 / T015] FR-008 — identity reflects the error (class, trap point,
// message, stack), NOT the browser route. Success metric 1 depends on this: the
// same logical error seen on ten different pages must yield ONE identity.
describe("computeErrorFingerprint", () => {
  const base = {
    name: "TypeError",
    kind: "serverHandler",
    message: "Cannot read properties of undefined (reading 'x')",
    stack:
      "TypeError: Cannot read properties of undefined\n" +
      "    at handler (/app/src/server/routes/foo.ts:42:13)\n" +
      "    at Layer.handle (/app/node_modules/express/lib/router/layer.js:95:5)",
    route: "/api/projects/11111111-1111-1111-1111-111111111111",
  };

  it("is deterministic for identical input", () => {
    expect(computeErrorFingerprint(base)).toBe(computeErrorFingerprint(base));
  });

  it("ignores volatile bits: line/col, absolute paths, uuids, numbers", () => {
    const occurrenceB = {
      ...base,
      // different line:col, different abs path prefix, a uuid + numbers in the message
      message: "Cannot read properties of undefined (reading 'x')",
      stack:
        "TypeError: Cannot read properties of undefined\n" +
        "    at handler (C:\\\\other\\\\path\\\\foo.ts:1007:2)\n" +
        "    at Layer.handle (C:\\\\x\\\\node_modules\\\\express\\\\lib\\\\router\\\\layer.js:3:9)",
      route: "/api/projects/9f8f0803-1234-4d74-b152-4ec6bac03a66",
    };
    expect(computeErrorFingerprint(occurrenceB)).toBe(computeErrorFingerprint(base));
  });

  it("distinguishes different error classes", () => {
    expect(computeErrorFingerprint({ ...base, name: "RangeError" })).not.toBe(
      computeErrorFingerprint(base),
    );
  });

  // [SCOPE 110 / T015] FR-008 — the browser route is NO LONGER part of identity.
  // (Supersedes the old SCOPE-061 assertion that route distinguished errors — that
  // over-discrimination is exactly the defect this scope corrects.)
  it("does NOT distinguish by route — same error on different pages is one identity", () => {
    expect(computeErrorFingerprint({ ...base, route: "/api/tasks" })).toBe(
      computeErrorFingerprint(base),
    );
  });

  it("collapses the same logical error seen on ten different pages to ONE identity", () => {
    const pages = [
      "/dashboard",
      "/projects",
      "/projects/abc",
      "/timer",
      "/invoices",
      "/settings",
      "/reports",
      "/team",
      "/help",
      "/account/billing",
    ];
    const ids = new Set(pages.map((route) => computeErrorFingerprint({ ...base, route })));
    expect(ids.size).toBe(1);
  });

  it("still distinguishes a genuinely different trap point (kind)", () => {
    expect(computeErrorFingerprint({ ...base, kind: "uncaughtException" })).not.toBe(
      computeErrorFingerprint(base),
    );
  });

  it("distinguishes different messages", () => {
    expect(
      computeErrorFingerprint({ ...base, message: "totally different failure" }),
    ).not.toBe(computeErrorFingerprint(base));
  });

  it("returns a stable 32-char hex digest", () => {
    expect(computeErrorFingerprint(base)).toMatch(/^[0-9a-f]{32}$/);
  });
});
