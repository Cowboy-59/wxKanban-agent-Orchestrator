import { describe, it, expect } from "vitest";
import {
  NODE_REGISTRY,
  createNode,
  parseSelectOptions,
  serializeSelectOptions,
  renderBlockCode,
  type BlockNode,
} from "~/shared/block-model";

// [SCOPE 108 / T001] — structured dropdown model

describe("SCOPE-108 dropdown registry", () => {
  it("exposes a structured options field plus placeholder and default", () => {
    const f = NODE_REGISTRY.select.fields;
    expect(f.find((x) => x.key === "optionsJson")?.type).toBe("options");
    expect(f.some((x) => x.key === "placeholder")).toBe(true);
    expect(f.some((x) => x.key === "defaultValue")).toBe(true);
  });

  it("a fresh dropdown has three default options", () => {
    const n = createNode("select");
    expect(parseSelectOptions(n)).toEqual([
      { value: "a", label: "Option A" },
      { value: "b", label: "Option B" },
      { value: "c", label: "Option C" },
    ]);
  });
});

describe("SCOPE-108 parseSelectOptions", () => {
  const sel = (props: Record<string, string>): BlockNode => ({ id: "n1", type: "select", props });

  it("reads structured optionsJson", () => {
    const n = sel({ optionsJson: '[{"value":"x","label":"X"},{"value":"y","label":"Y"}]' });
    expect(parseSelectOptions(n)).toEqual([
      { value: "x", label: "X" },
      { value: "y", label: "Y" },
    ]);
  });

  it("falls back to the legacy comma-separated options (back-compat)", () => {
    const n = sel({ options: "Option A, Option B, Option C" });
    expect(parseSelectOptions(n)).toEqual([
      { value: "Option A", label: "Option A" },
      { value: "Option B", label: "Option B" },
      { value: "Option C", label: "Option C" },
    ]);
  });

  it("falls back to legacy on malformed JSON", () => {
    const n = sel({ optionsJson: "{not json", options: "A, B" });
    expect(parseSelectOptions(n)).toEqual([
      { value: "A", label: "A" },
      { value: "B", label: "B" },
    ]);
  });

  it("returns [] when nothing is set", () => {
    expect(parseSelectOptions(sel({}))).toEqual([]);
  });

  it("backfills value from label and vice-versa", () => {
    const n = sel({ optionsJson: '[{"label":"Only label"},{"value":"only-value"}]' });
    expect(parseSelectOptions(n)).toEqual([
      { value: "Only label", label: "Only label" },
      { value: "only-value", label: "only-value" },
    ]);
  });

  it("round-trips through serializeSelectOptions", () => {
    const opts = [{ value: "1", label: "One" }, { value: "2", label: "Two" }];
    const n = sel({ optionsJson: serializeSelectOptions(opts) });
    expect(parseSelectOptions(n)).toEqual(opts);
  });
});

describe("SCOPE-108 dropdown emit", () => {
  const block = (props: Record<string, string>) => ({
    id: "b",
    name: "T",
    nodes: [{ id: "n1", type: "select" as const, props }],
  });

  it("emits a native <select> with defaultValue and option value attributes", () => {
    const code = renderBlockCode(
      block({ label: "Pick", optionsJson: '[{"value":"x","label":"X"},{"value":"y","label":"Y"}]', defaultValue: "y" }),
    );
    expect(code).toContain("<select defaultValue={\"y\"}");
    expect(code).toContain("<option value={\"x\"}>{\"X\"}</option>");
    expect(code).toContain("<option value={\"y\"}>{\"Y\"}</option>");
  });

  it("emits a placeholder option when set", () => {
    const code = renderBlockCode(block({ optionsJson: '[{"value":"x","label":"X"}]', placeholder: "Choose one" }));
    expect(code).toContain("<option value=\"\">{\"Choose one\"}</option>");
  });

  it("still emits options for a legacy comma-string select (back-compat)", () => {
    const code = renderBlockCode(block({ label: "L", options: "Red, Green" }));
    expect(code).toContain("<option value={\"Red\"}>{\"Red\"}</option>");
    expect(code).toContain("<option value={\"Green\"}>{\"Green\"}</option>");
  });

  it("emitted option values match parseSelectOptions (canvas uses the same source → parity)", () => {
    // BlockRenderer's <select> arm and emitNode both derive options from parseSelectOptions,
    // so the emitted <option value> list must equal the parsed values, in order.
    const node: BlockNode = {
      id: "n1",
      type: "select",
      props: { optionsJson: '[{"value":"a","label":"Apple"},{"value":"b","label":"Banana"}]' },
    };
    const parsed = parseSelectOptions(node).map((o) => o.value);
    const code = renderBlockCode({ id: "b", name: "T", nodes: [node] });
    const emitted = [...code.matchAll(/<option value=\{"([^"]*)"\}>/g)].map((m) => m[1]);
    expect(emitted).toEqual(parsed);
  });
});
