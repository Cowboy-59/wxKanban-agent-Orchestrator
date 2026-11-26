/**
 * SPEC-159 Amendment A, T022 (FR-095) — the one command list. Every command resolves by its name
 * and its aliases, in any casing, with a trailing "." or "!" and loose whitespace. Anything that
 * is not the whole command resolves to nothing. Pure: no I/O.
 */
import { describe, expect, it } from "vitest";
import {
  COMMANDS,
  MAX_COMMAND_CHARS,
  formatCommandList,
  normalizeCommandText,
  resolveCommand,
} from "../../apps/remote-bridge/src/command-set";
import { isListAnswer } from "../../apps/remote-bridge/src/inbound";

// [SCOPE 159 / T022] BEGIN — every command resolves; nothing else does (FR-095)
/** How the words are typed: "skip" needs its number. */
const typed = (w: string, argument?: "num" | "debug"): string => (argument === "num" ? `${w} 3` : w);

describe("FR-095 the one command list resolves every command", () => {
  it("holds the commands the room and the session share", () => {
    expect(COMMANDS.map((c) => c.name)).toEqual([
      "status",
      "autopilot",
      "go",
      "no",
      "skip",
      "stop",
      "continue",
      "pause",
      "resume",
      "verbose",
      "concise",
      "push",
      "transfer to agent",
      "triage",
      "cancel remote",
    ]);
  });

  it("every name and every alias resolves to its own entry", () => {
    for (const c of COMMANDS) {
      for (const w of [c.name, ...c.aliases]) {
        expect(resolveCommand(typed(w, c.argument))?.name).toBe(c.name);
      }
    }
  });

  it("casing, a trailing . or ! and loose whitespace do not matter", () => {
    for (const c of COMMANDS) {
      const w = typed(c.name, c.argument);
      for (const variant of [w.toUpperCase(), `  ${w}  `, `${w}.`, `${w}!`, `${w}!!`, w.replace(/ /g, "   ")]) {
        expect(resolveCommand(variant)?.name).toBe(c.name);
      }
    }
    expect(resolveCommand("Transfer To Agent")?.name).toBe("transfer to agent");
    expect(resolveCommand("RUN DEVPLAN")?.name).toBe("autopilot");
    expect(resolveCommand("STOP.")?.name).toBe("stop");
  });

  it("go takes an optional debug; skip needs a number", () => {
    expect(resolveCommand("go debug")?.name).toBe("go");
    expect(resolveCommand("GO DEBUG")?.name).toBe("go");
    expect(resolveCommand("go now")).toBeNull();
    expect(resolveCommand("skip")).toBeNull();
    expect(resolveCommand("skip x")).toBeNull();
    expect(resolveCommand("skip 12")?.name).toBe("skip");
  });

  it("text that is not the whole command resolves to nothing", () => {
    for (const t of ["", "   ", "frobnicate", "please stop", "stop now", "status?", "CONFIRMED", "yes", "pushed", "go go"]) {
      expect(resolveCommand(t)).toBeNull();
    }
    expect(resolveCommand(`stop${" ".repeat(MAX_COMMAND_CHARS)}`)).toBeNull();
  });

  it("normalizes the way the lane hands text on", () => {
    expect(normalizeCommandText("  Skip   3!  ")).toBe("skip 3");
  });

  it("the devplan list's answers are the list's answer commands", () => {
    for (const c of COMMANDS) {
      expect(isListAnswer(typed(c.name, c.argument))).toBe(c.kind === "answer");
    }
  });

  it("--list prints one line per command, starting with its usage", () => {
    const lines = formatCommandList();
    expect(lines).toHaveLength(COMMANDS.length);
    expect(lines[0].startsWith("status — ")).toBe(true);
    expect(lines.some((l) => l.startsWith("autopilot (also: run devplan) — "))).toBe(true);
    expect(lines.some((l) => l.startsWith("skip <num> — "))).toBe(true);
    expect(lines.some((l) => l.startsWith("go [debug] — "))).toBe(true);
    expect(lines.find((l) => l.startsWith("cancel remote"))?.endsWith("[room only]")).toBe(true);
  });
});
// [SCOPE 159 / T022] END
