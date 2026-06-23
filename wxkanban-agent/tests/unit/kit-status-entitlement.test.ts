// Phase 4 — kit:status entitlement readout. Verifies summarizeEntitlement maps a
// cached signed token to the right customer-facing state. Uses an in-test keypair
// (injected verify key) so no real signing key is needed.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync, sign, type KeyObject } from "crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { summarizeEntitlement } from "../../core/orchestrator/command-handlers/kit-status";

let priv: KeyObject;
let pubPem: string;
let root: string;
const NOW = 1_900_000_000;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function mint(status: string | null, iat: number, exp: number): string {
  const body = b64url(Buffer.from(JSON.stringify({ customerId: "c1", status, iat, exp })));
  return `${body}.${b64url(sign(null, Buffer.from(body), priv))}`;
}
function writeCache(token: string): void {
  mkdirSync(join(root, ".wxai"), { recursive: true });
  writeFileSync(join(root, ".wxai", ".entitlement"), token, "utf8");
}

beforeEach(() => {
  const kp = generateKeyPairSync("ed25519");
  priv = kp.privateKey;
  pubPem = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
  root = mkdtempSync(join(tmpdir(), "wxks-"));
});
afterEach(() => {
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});

describe("summarizeEntitlement", () => {
  it("unknown when no token cached", () => {
    expect(summarizeEntitlement(root, NOW, pubPem).state).toBe("unknown");
  });

  it("active for ACTIVE with comfortable headroom", () => {
    writeCache(mint("ACTIVE", NOW - 100, NOW + 6 * 86400));
    const r = summarizeEntitlement(root, NOW, pubPem);
    expect(r.state).toBe("active");
    expect(r.status).toBe("ACTIVE");
  });

  it("grace when within 2 days of expiry", () => {
    writeCache(mint("TRIAL", NOW - 100, NOW + 1 * 86400));
    expect(summarizeEntitlement(root, NOW, pubPem).state).toBe("grace");
  });

  it("expired past the grace window", () => {
    writeCache(mint("ACTIVE", NOW - 10 * 86400, NOW - 1));
    expect(summarizeEntitlement(root, NOW, pubPem).state).toBe("expired");
  });

  it("inactive for a non-allowed status", () => {
    writeCache(mint("SUSPENDED", NOW - 100, NOW + 6 * 86400));
    const r = summarizeEntitlement(root, NOW, pubPem);
    expect(r.state).toBe("inactive");
    expect(r.status).toBe("SUSPENDED");
  });

  it("unknown when the token signature is invalid", () => {
    writeCache(mint("ACTIVE", NOW - 100, NOW + 6 * 86400) + "tamper");
    expect(summarizeEntitlement(root, NOW, pubPem).state).toBe("unknown");
  });
});
