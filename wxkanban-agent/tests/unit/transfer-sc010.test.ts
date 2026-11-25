/**
 * [SCOPE 159 / T020] SC-010: across fixture transcripts a transfer carries 0 tool, sub-agent or
 * system entries, and 100% of transfers are refused with the masker missing or the switch off.
 */
import { describe, expect, it } from "vitest";
import { redactSecrets } from "../../apps/remote-bridge/src/redact";
import { checkTransferGuards, explainPieces, maskOrRefuse, spokenWords } from "../../apps/remote-bridge/src/transfer";

const L = (o: unknown) => JSON.stringify(o);
const SECRET = "ghp_abcdefghijklmnopqrstuvwxyz0123456789";

/** Words that must never appear: each is planted only inside a non-spoken entry. */
const FORBIDDEN = ["TOOLCALL-MARK", "TOOLOUT-MARK", "SIDECHAIN-MARK", "SYSTEM-MARK", "SUMMARY-MARK", "ATTACH-MARK", "THINKING-MARK", "HOOK-MARK"];

function fixture(seed: number): string {
  const rows: string[] = [];
  for (let i = 0; i < 60; i += 1) {
    const n = seed * 100 + i;
    rows.push(L({ type: "user", message: { content: `dev says ${n} ${i % 7 === 0 ? SECRET : ""}` } }));
    rows.push(L({ type: "assistant", message: { content: [{ type: "text", text: `assistant says ${n}` }, { type: "tool_use", name: "Bash", input: { command: "TOOLCALL-MARK ls" } }, { type: "thinking", thinking: "THINKING-MARK" }] } }));
    rows.push(L({ type: "user", message: { content: [{ type: "tool_result", content: "TOOLOUT-MARK output" }] } }));
    rows.push(L({ type: "assistant", isSidechain: true, message: { content: [{ type: "text", text: "SIDECHAIN-MARK words" }] } }));
    rows.push(L({ type: "system", subtype: "x", content: "SYSTEM-MARK" }));
    rows.push(L({ type: "summary", summary: "SUMMARY-MARK" }));
    rows.push(L({ type: "attachment", attachment: { text: "ATTACH-MARK" } }));
    rows.push(L({ type: "system", message: { content: "HOOK-MARK" } }));
    if (i % 11 === 0) rows.push("{ torn line");
  }
  return rows.join("\n");
}

describe("SC-010 no tool, sub-agent or system entries", () => {
  it("20 fixture transcripts: 0 forbidden entries in the spoken words or in the masked pieces", () => {
    let spokenTotal = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const spoken = spokenWords(fixture(seed));
      spokenTotal += spoken.length;
      for (const s of spoken) {
        expect(["developer", "assistant"]).toContain(s.role);
        for (const f of FORBIDDEN) expect(s.text).not.toContain(f);
      }
      const out = explainPieces(spoken, redactSecrets);
      expect(out.ok).toBe(true);
      if (out.ok) {
        const all = out.pieces.map((p) => JSON.stringify(p)).join("\n");
        for (const f of FORBIDDEN) expect(all).not.toContain(f);
        expect(all).not.toContain(SECRET);
      }
    }
    expect(spokenTotal).toBeGreaterThan(500);
  });
});

describe("SC-010 refused with the masker missing or the switch off", () => {
  it("masker missing: refused in 100% of 20 transcripts and no text comes back", () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const spoken = spokenWords(fixture(seed));
      for (const masker of [undefined, null as never, "x" as never]) {
        const r = explainPieces(spoken, masker);
        expect(r).toEqual({ ok: false, reason: "masker_missing" });
      }
      expect(maskOrRefuse("anything", undefined)).toEqual({ ok: false, reason: "masker_missing" });
    }
  });

  it("switch off: refused in every combination of the other guards", () => {
    let trials = 0;
    for (const statusSharingOn of [true, false]) {
      for (const sameCompany of [true, false]) {
        const r = checkTransferGuards({ statusSharingOn, transferSwitchOn: false, projectCompanyId: "c1", askingCompanyId: sameCompany ? "c1" : "c2" });
        expect(r.ok).toBe(false);
        trials += 1;
      }
    }
    expect(trials).toBe(4);
    // And the one allowed combination is the only one that passes.
    expect(checkTransferGuards({ statusSharingOn: true, transferSwitchOn: true, projectCompanyId: "c1", askingCompanyId: "c1" }).ok).toBe(true);
  });
});
