import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import {
  findRetiredRoomKeys,
  noticeRetiredRoomKeys,
  retiredKeysNoticePath,
} from "../../core/bootstrap/retired-room-keys";

// [SCOPE 150 / T006] BEGIN — Retired room key notice tests
describe("noticeRetiredRoomKeys (SPEC-150 FR-014)", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "retired-keys-"));
  });
  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const envFile = () => join(root, ".env");
  const md5 = (p: string) => createHash("md5").update(readFileSync(p)).digest("hex");
  const OLD_ENV = [
    "WXKANBAN_API_TOKEN=wxk_keep_me",
    "YAPPCHATT_ROOM=room-secret-value",
    "export YAPPCHATT_TOKEN=yca_secret_value",
    "# YAPPCHATT_EMAIL=commented@out.example",
    "WXKANBAN_REMOTE_SEED=seed-secret-value",
    "YAPPCHATT_DISPLAY_NAME=still-read",
    "",
  ].join("\n");

  it("prints exactly once across three runs, and the .env is byte-identical", () => {
    writeFileSync(envFile(), OLD_ENV, "utf8");
    writeFileSync(join(root, ".gitignore"), "node_modules/\n", "utf8");
    const before = md5(envFile());
    const printed: string[] = [];
    const results = [1, 2, 3].map(() => noticeRetiredRoomKeys(root, (l) => printed.push(l)));
    expect(results).toEqual([true, false, false]);
    expect(printed).toHaveLength(1);
    expect(md5(envFile())).toBe(before);
    expect(existsSync(retiredKeysNoticePath(root))).toBe(true);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toContain("**/.wxai/retired-room-keys-notice.json");
  });

  it("names the retired keys only, never a value, and skips comments and keys still read", () => {
    writeFileSync(envFile(), OLD_ENV, "utf8");
    expect(findRetiredRoomKeys(root)).toEqual(["YAPPCHATT_ROOM", "YAPPCHATT_TOKEN", "WXKANBAN_REMOTE_SEED"]);
    const printed: string[] = [];
    noticeRetiredRoomKeys(root, (l) => printed.push(l));
    const out = printed.join("\n");
    for (const value of ["room-secret-value", "yca_secret_value", "seed-secret-value", "wxk_keep_me", "commented@out"]) {
      expect(out).not.toContain(value);
    }
    expect(out).not.toContain("YAPPCHATT_EMAIL");
    expect(out).not.toContain("YAPPCHATT_DISPLAY_NAME");
  });

  it("prints nothing and records nothing when no retired key is present", () => {
    writeFileSync(envFile(), "WXKANBAN_API_TOKEN=wxk_x\nYAPPCHATT_URL=https://example.test\n", "utf8");
    const printed: string[] = [];
    expect(noticeRetiredRoomKeys(root, (l) => printed.push(l))).toBe(false);
    expect(printed).toEqual([]);
    expect(existsSync(retiredKeysNoticePath(root))).toBe(false);
  });

  it("does nothing when there is no .env, and never creates one", () => {
    expect(noticeRetiredRoomKeys(root, () => undefined)).toBe(false);
    expect(existsSync(envFile())).toBe(false);
  });
});
// [SCOPE 150 / T006] END
