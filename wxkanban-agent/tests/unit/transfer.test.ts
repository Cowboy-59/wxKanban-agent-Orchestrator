/**
 * [SCOPE 159 / T015] Transfer to agent (FR-068..FR-072).
 */
import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../apps/remote-bridge/src/redact";
import {
  PIECE_MAX,
  checkTransferGuards,
  explainPieces,
  isExplain,
  maskOrRefuse,
  numberPieces,
  parseTransfer,
  pieceOf,
  spokenWords,
  toPieces,
  transferLogLine,
} from "../../apps/remote-bridge/src/transfer";

const L = (o: unknown) => JSON.stringify(o);

describe("UT-056 trigger and transcript source", () => {
  it("both triggers record who asked; other text is no trigger", () => {
    expect(parseTransfer("transfer to agent", "developer")?.askedBy.kind).toBe("developer");
    expect(parseTransfer("transfer", "kain")?.askedBy.kind).toBe("kain");
    expect(parseTransfer("transfer", "developer")).toBeNull();
    expect(parseTransfer("please transfer to agent now", "developer")).toBeNull();
  });
  it("a fixture transcript yields no tool, sub-agent or system text", () => {
    const raw = [
      L({ type: "user", message: { content: "dev words" } }),
      L({ type: "assistant", message: { content: [{ type: "text", text: "asst words" }, { type: "tool_use", name: "Bash", input: { command: "SECRETCMD" } }] } }),
      L({ type: "user", message: { content: [{ type: "tool_result", content: "TOOLOUT" }] } }),
      L({ type: "assistant", isSidechain: true, message: { content: "SUBAGENT" } }),
      L({ type: "system", message: { content: "SYSTEM" } }),
      "not json",
    ].join("\n");
    const out = spokenWords(raw);
    expect(out.map((s) => s.text)).toEqual(["dev words", "asst words"]);
    expect(JSON.stringify(out)).not.toMatch(/SECRETCMD|TOOLOUT|SUBAGENT|SYSTEM/);
  });
  it("only the last 500 lines count", () => {
    const raw = Array.from({ length: 600 }, (_, i) => L({ type: "user", message: { content: `m${i}` } })).join("\n");
    const out = spokenWords(raw);
    expect(out).toHaveLength(500);
    expect(out[0]?.text).toBe("m100");
  });
});

describe("UT-057 masked or nothing, pieces", () => {
  it("with the masker removed nothing leaves", () => {
    expect(maskOrRefuse("x", undefined)).toEqual({ ok: false, reason: "masker_missing" });
    expect(explainPieces([{ role: "developer", text: "x" }], undefined)).toEqual({ ok: false, reason: "masker_missing" });
  });
  it("explain masks secrets and no piece exceeds 2,000 characters", () => {
    const spoken = Array.from({ length: 200 }, (_, i) => ({ role: "developer" as const, text: `line ${i} AKIAIOSFODNN7EXAMPLE ${"y".repeat(60)}` }));
    const r = explainPieces(spoken, redactSecrets);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pieces.every((p) => p.body.length <= PIECE_MAX)).toBe(true);
    expect(r.pieces.map((p) => p.body).join("")).not.toContain("AKIAIOSFODNN7EXAMPLE");
    const last = r.pieces[r.pieces.length - 1]!;
    expect(last.label).toBe(`piece ${last.of} of ${last.of}`);
    expect(pieceOf(r.pieces, 3)).toEqual(r.pieces[2]);
    expect(pieceOf(r.pieces, 9999)).toBeUndefined();
  });
  it("a single over-long line is split; the bare word explain triggers, 'explain this' does not", () => {
    expect(toPieces("z".repeat(4500)).map((p) => p.length)).toEqual([2000, 2000, 500]);
    expect(numberPieces(["a", "b"])[1]?.label).toBe("piece 2 of 2");
    expect(isExplain("explain")).toBe(true);
    expect(isExplain("explain this")).toBe(false);
  });
});

describe("UT-058 guards and log", () => {
  const ok = { statusSharingOn: true, transferSwitchOn: true, projectCompanyId: "c1", askingCompanyId: "c1" };
  it("a company with the switch off refuses and posts the reason", () => {
    const r = checkTransferGuards({ ...ok, transferSwitchOn: false });
    expect(r).toMatchObject({ ok: false, reason: "switch_off" });
    expect(!r.ok && r.post).toMatch(/switch is off/);
  });
  it("a KAIN outside the company is refused; status sharing off is refused; all on is allowed", () => {
    expect(checkTransferGuards({ ...ok, askingCompanyId: "c2" })).toMatchObject({ ok: false, reason: "company_wall" });
    expect(checkTransferGuards({ ...ok, statusSharingOn: false })).toMatchObject({ ok: false, reason: "status_sharing_off" });
    expect(checkTransferGuards(ok)).toEqual({ ok: true });
  });
  it("the log line records asked-by and the outcome", () => {
    const t = parseTransfer("transfer", "kain")!;
    expect(transferLogLine(t, { ok: true, masked: 2 })).toEqual({ event: "transfer", askedBy: "kain", mode: "summary", masked: 2 });
    expect(transferLogLine(t, { ok: false, reason: "masker_missing" }).event).toBe("refused");
  });
});
