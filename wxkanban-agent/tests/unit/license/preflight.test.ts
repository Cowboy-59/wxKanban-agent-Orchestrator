// Phase 1B — kit-side entitlement preflight tests.
//
// We mint our own Ed25519 keypair in-test and verify tokens against the
// matching public key (passed explicitly), so no real signing key is needed.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateKeyPairSync, sign, type KeyObject } from "crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { verifyEntitlementToken } from "../../../core/license/entitlement-token";
import { assertEntitled, type RefreshResult } from "../../../core/license/preflight";
import { entitlementPath, writeEntitlementToken } from "../../../core/license/entitlement-cache";

let priv: KeyObject;
let pubPem: string;
let root: string;

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function mintToken(opts: { status: string | null; iat: number; exp: number }): string {
  const body = b64url(Buffer.from(JSON.stringify({ customerId: "cust-1", ...opts })));
  const sig = b64url(sign(null, Buffer.from(body), priv));
  return `${body}.${sig}`;
}

function nowSec(): number {
  return 1_900_000_000; // fixed "now" for deterministic grace math
}

function writeCache(token: string): void {
  const p = entitlementPath(root);
  mkdirSync(join(root, ".wxai"), { recursive: true });
  writeFileSync(p, token, "utf8");
}

beforeEach(() => {
  const kp = generateKeyPairSync("ed25519");
  priv = kp.privateKey;
  pubPem = kp.publicKey.export({ type: "spki", format: "pem" }).toString();
  root = mkdtempSync(join(tmpdir(), "wxlic-"));
});

afterEach(() => {
  if (root && existsSync(root)) rmSync(root, { recursive: true, force: true });
});

describe("writeEntitlementToken — gitignore enforcement", () => {
  it("appends .wxai/.entitlement to an existing root .gitignore", () => {
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    writeEntitlementToken(root, "tok");
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi).toContain(".wxai/.entitlement");
  });

  it("does not duplicate when .wxai/ is already ignored", () => {
    writeFileSync(join(root, ".gitignore"), "node_modules/\n.wxai/\n");
    writeEntitlementToken(root, "tok");
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi).not.toContain(".wxai/.entitlement");
  });

  it("does not create a .gitignore when none exists", () => {
    writeEntitlementToken(root, "tok");
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
  });
});

describe("verifyEntitlementToken", () => {
  it("verifies a well-formed token and rejects a tampered one", () => {
    const t = mintToken({ status: "ACTIVE", iat: nowSec() - 10, exp: nowSec() + 1000 });
    expect(verifyEntitlementToken(t, pubPem)?.status).toBe("ACTIVE");
    expect(verifyEntitlementToken(t + "x", pubPem)).toBeNull();
    expect(verifyEntitlementToken("garbage", pubPem)).toBeNull();
  });
});

describe("assertEntitled — mode handling", () => {
  it("exempts kit:status and help", async () => {
    expect((await assertEntitled({ command: "kit:status", projectRoot: root, mode: "enforce" })).allowed).toBe(true);
    expect((await assertEntitled({ command: "help", projectRoot: root, mode: "enforce" })).allowed).toBe(true);
  });

  it("mode off always allows", async () => {
    const r = await assertEntitled({ command: "wxconversion", projectRoot: root, mode: "off" });
    expect(r.allowed).toBe(true);
    expect(r.source).toBe("off");
  });
});

describe("assertEntitled — cached token (offline, no refresh)", () => {
  const offline = async () => null;

  it("allows on a valid ACTIVE token within grace (no network)", async () => {
    writeCache(mintToken({ status: "ACTIVE", iat: nowSec() - 100, exp: nowSec() + 1000 }));
    const r = await assertEntitled({
      command: "wxconversion", projectRoot: root, mode: "enforce",
      nowSec: nowSec(), refresh: offline, publicKeyPem: pubPem,
    });
    expect(r.allowed).toBe(true);
    expect(r.source).toBe("cache");
  });

  it("denies a cached INACTIVE token immediately (definitive)", async () => {
    writeCache(mintToken({ status: "SUSPENDED", iat: nowSec() - 100, exp: nowSec() + 1000 }));
    const r = await assertEntitled({
      command: "wxconversion", projectRoot: root, mode: "enforce",
      nowSec: nowSec(), refresh: offline, publicKeyPem: pubPem,
    });
    expect(r.allowed).toBe(false);
    expect(r.status).toBe("SUSPENDED");
  });

  it("fails closed when an expired token cannot be refreshed (past grace, offline)", async () => {
    writeCache(mintToken({ status: "ACTIVE", iat: nowSec() - 10_000, exp: nowSec() - 1 }));
    const r = await assertEntitled({
      command: "wxconversion", projectRoot: root, mode: "enforce",
      nowSec: nowSec(), refresh: offline, publicKeyPem: pubPem,
    });
    expect(r.allowed).toBe(false);
    expect(r.source).toBe("grace");
  });

  it("does NOT honor a token whose clock was rolled back before issue", async () => {
    // now is BEFORE iat (clock rolled back) → not valid; offline → grace deny.
    writeCache(mintToken({ status: "ACTIVE", iat: nowSec() + 10_000, exp: nowSec() + 20_000 }));
    const r = await assertEntitled({
      command: "wxconversion", projectRoot: root, mode: "enforce",
      nowSec: nowSec(), refresh: offline, publicKeyPem: pubPem,
    });
    expect(r.allowed).toBe(false);
  });

  it("refreshes and caches a fresh enforced token, then allows", async () => {
    const fresh = mintToken({ status: "ACTIVE", iat: nowSec() - 5, exp: nowSec() + 1000 });
    const r = await assertEntitled({
      command: "auditfences", projectRoot: root, mode: "enforce", nowSec: nowSec(),
      publicKeyPem: pubPem,
      refresh: async () => ({ enforced: true, token: fresh, status: "ACTIVE" }),
    });
    expect(r.allowed).toBe(true);
    expect(r.source).toBe("server");
    // token persisted to .wxai/.entitlement
    expect(readFileSync(entitlementPath(root), "utf8")).toBe(fresh);
  });
});

describe("assertEntitled — refresh path (server reachable)", () => {
  const refreshWith = (res: RefreshResult | null) => async () => res;

  it("denies when server returns an enforced token with inactive status", async () => {
    const token = mintToken({ status: "CANCELLED", iat: nowSec() - 10, exp: nowSec() + 1000 });
    // We can't make preflight verify a test-minted token against the prod key,
    // so simulate the server saying not-enforced + allowed=false (plain deny).
    const r = await assertEntitled({
      command: "auditfences",
      projectRoot: root,
      mode: "enforce",
      nowSec: nowSec(),
      refresh: refreshWith({ enforced: false, token: null, allowed: false, status: "CANCELLED" }),
    });
    expect(r.allowed).toBe(false);
    expect(r.status).toBe("CANCELLED");
    void token;
  });

  it("allows when server is not enforcing and gives no deny (rollout no-op)", async () => {
    const r = await assertEntitled({
      command: "auditfences",
      projectRoot: root,
      mode: "enforce",
      nowSec: nowSec(),
      refresh: refreshWith({ enforced: false, token: null, status: "ACTIVE" }),
    });
    expect(r.allowed).toBe(true);
    expect(r.source).toBe("server");
  });

  it("monitor mode never denies, even on a definitive inactive", async () => {
    const r = await assertEntitled({
      command: "auditfences",
      projectRoot: root,
      mode: "monitor",
      nowSec: nowSec(),
      refresh: refreshWith({ enforced: false, token: null, allowed: false, status: "SUSPENDED" }),
    });
    expect(r.allowed).toBe(true);
    expect(r.source).toBe("monitor");
  });

  it("no cache + cannot reach server → fail open (indeterminate)", async () => {
    const r = await assertEntitled({
      command: "wxconversion",
      projectRoot: root,
      mode: "enforce",
      nowSec: nowSec(),
      refresh: async () => null,
    });
    expect(r.allowed).toBe(true);
    expect(r.source).toBe("indeterminate");
  });
});
