import { describe, it, expect } from "vitest";
import {
  renderBugTrappingScope,
  BUG_TRAPPING_SEED_MARKER,
  BUG_TRAPPING_SEED_TITLE,
} from "~/server/lib/bugTrappingScopeTemplate";

// [SCOPE 063 / T011] FR-004/FR-005 — the seeded scope must be project-parameterized
// (embeds THIS project's ingest endpoint), carry the idempotency marker, and NEVER
// embed the ingest token (secrets must not live in a persisted scope row).
describe("renderBugTrappingScope", () => {
  const endpoint = "https://app.wxperts.com/api/projects/abc-123/errors";
  const md = renderBugTrappingScope({ projectName: "Acme App", ingestEndpoint: endpoint });

  it("embeds the project's ingest endpoint", () => {
    expect(md).toContain(endpoint);
  });

  it("carries the idempotency seed marker", () => {
    expect(md).toContain(BUG_TRAPPING_SEED_MARKER);
  });

  it("names the project", () => {
    expect(md).toContain("Acme App");
  });

  it("uses the canonical seed title heading", () => {
    expect(md).toContain(BUG_TRAPPING_SEED_TITLE);
  });

  it("instructs sourcing the token from the environment, never embedding a secret", () => {
    expect(md).toContain("WXKANBAN_ERROR_INGEST_TOKEN");
    // The template must reference the env var name but never a Bearer literal value.
    expect(md).not.toMatch(/Bearer\s+[A-Za-z0-9._-]{20,}/);
  });
});
