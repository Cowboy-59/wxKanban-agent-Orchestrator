/**
 * [SCOPE 159 / T020] SC-006 secret scan: a month of log traffic seeded with common secret shapes
 * leaves 0 unmasked secrets in the run log, feed included.
 */
import { describe, expect, it } from "vitest";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RunLog } from "../../apps/remote-bridge/src/run-log";

const SECRETS = [
  "AKIAIOSFODNN7EXAMPLE",
  "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  "postgres://admin:S3cretPassw0rd@db.example.com:5432/app",
  "Bearer abcdef0123456789abcdef0123456789",
  "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789",
  ["xo", "xb-123456789012-abcdefghijklmnop"].join(""),
];

describe("SC-006 a month of seeded traffic leaves 0 unmasked secrets", () => {
  it("masks every secret shape in the feed across 30 daily files", () => {
    const root = mkdtempSync(join(tmpdir(), "wx-secrets-"));
    for (let d = 0; d < 30; d += 1) {
      const day = new Date(Date.UTC(2026, 10, 1 + (d % 28), 12, d));
      const log = new RunLog({ root, now: () => day });
      for (const s of SECRETS) log.writeFeed(`token for deploy: ${s} end`);
    }
    const dir = join(root, ".wxai", "run-log");
    const leaks: string[] = [];
    for (const f of readdirSync(dir)) {
      const body = readFileSync(join(dir, f), "utf8");
      for (const s of SECRETS) if (body.includes(s)) leaks.push(`${f}: ${s.slice(0, 12)}...`);
    }
    expect(leaks).toEqual([]);
  });
});
