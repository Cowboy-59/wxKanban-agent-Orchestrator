// tests/wxdbanalyze/pgtypes.test.ts
import { describe, expect, it } from "vitest";
import { canonicalizeType, typesEquivalent } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/pgtypes.js";

describe("canonicalizeType / typesEquivalent", () => {
  describe("alias pairs collapse to the same canonical type", () => {
    const aliasPairs: Array<[string, string, string]> = [
      ["timestamp -> timestamp without time zone", "timestamp", "timestamp without time zone"],
      ["timestamptz -> timestamp with time zone", "timestamptz", "timestamp with time zone"],
      ["time -> time without time zone", "time", "time without time zone"],
      ["timetz -> time with time zone", "timetz", "time with time zone"],
      ["varchar(50) -> character varying(50)", "varchar(50)", "character varying(50)"],
      ["varchar -> character varying (both bare)", "varchar", "character varying"],
      ["char(10) -> character(10)", "char(10)", "character(10)"],
      ["int -> integer", "int", "integer"],
      ["int4 -> integer", "int4", "integer"],
      ["int8 -> bigint", "int8", "bigint"],
      ["int2 -> smallint", "int2", "smallint"],
      ["bool -> boolean", "bool", "boolean"],
      ["float8 -> double precision", "float8", "double precision"],
      ["float4 -> real", "float4", "real"],
      ["decimal(10,2) -> numeric(10,2)", "decimal(10,2)", "numeric(10,2)"],
      ["numeric(a, b) whitespace-only -> numeric(a,b)", "numeric(10, 2)", "numeric(10,2)"],
    ];

    for (const [label, declaredType, liveType] of aliasPairs) {
      it(label, () => {
        expect(typesEquivalent(declaredType, liveType)).toBe(true);
      });
    }
  });

  describe("real differences remain reported (never collapsed)", () => {
    const realDifferences: Array<[string, string, string]> = [
      ["timestamp vs timestamp with time zone — naive vs aware is semantic, not spelling", "timestamp", "timestamp with time zone"],
      ["numeric(10,2) vs bare numeric — dropped precision/scale", "numeric(10,2)", "numeric"],
      ["varchar(20) vs character varying(50) — different lengths", "varchar(20)", "character varying(50)"],
      ["uuid vs character varying — different types entirely", "uuid", "character varying"],
      ["text vs character varying(255)", "text", "character varying(255)"],
      ["text[] vs text — array vs scalar must not collapse to element type", "text[]", "text"],
    ];

    for (const [label, declaredType, liveType] of realDifferences) {
      it(label, () => {
        expect(typesEquivalent(declaredType, liveType)).toBe(false);
      });
    }
  });

  describe("parameter whitespace normalises without touching parameter values", () => {
    it("collapses whitespace-only differences inside parameter lists", () => {
      expect(typesEquivalent("numeric(10, 2)", "numeric(10,2)")).toBe(true);
      expect(canonicalizeType("numeric(10, 2)").params).toBe("10,2");
    });

    it("never treats different parameter values as equivalent", () => {
      expect(typesEquivalent("numeric(10,2)", "numeric(11,2)")).toBe(false);
      expect(typesEquivalent("numeric(10,2)", "numeric(10,3)")).toBe(false);
      expect(typesEquivalent("character varying(20)", "character varying(50)")).toBe(false);
    });

    it("treats bare and parameterised forms of the same base as different", () => {
      expect(typesEquivalent("numeric", "numeric(10,2)")).toBe(false);
      expect(canonicalizeType("numeric").params).toBeNull();
      expect(canonicalizeType("numeric(10,2)").params).toBe("10,2");
    });
  });

  describe("array dimensionality is compared separately from the element type", () => {
    it("matches same element type, same depth, even across an alias", () => {
      expect(typesEquivalent("int4[]", "integer[]")).toBe(true);
      expect(typesEquivalent("varchar(50)[]", "character varying(50)[]")).toBe(true);
    });

    it("does not match when array depth differs, even for the same element type", () => {
      expect(typesEquivalent("text[]", "text")).toBe(false);
      expect(typesEquivalent("text", "text[]")).toBe(false);
      expect(typesEquivalent("integer[]", "integer[][]")).toBe(false);
    });

    it("still catches an element-type mismatch inside matching array depth", () => {
      expect(typesEquivalent("uuid[]", "character varying[]")).toBe(false);
    });

    it("exposes arrayDepth on the canonical form", () => {
      expect(canonicalizeType("text").arrayDepth).toBe(0);
      expect(canonicalizeType("text[]").arrayDepth).toBe(1);
      expect(canonicalizeType("text[][]").arrayDepth).toBe(2);
    });
  });

  describe("serial family — resolved to the underlying integer type for comparison only", () => {
    it("serial matches the integer family it expands to", () => {
      expect(typesEquivalent("serial", "integer")).toBe(true);
      expect(typesEquivalent("bigserial", "bigint")).toBe(true);
      expect(typesEquivalent("smallserial", "smallint")).toBe(true);
    });

    it("canonicalizes each serial alias to its plain integer base", () => {
      expect(canonicalizeType("serial").base).toBe("integer");
      expect(canonicalizeType("bigserial").base).toBe("bigint");
      expect(canonicalizeType("smallserial").base).toBe("smallint");
    });

    it("does not match a serial declaration against the wrong integer width", () => {
      expect(typesEquivalent("serial", "bigint")).toBe(false);
      expect(typesEquivalent("bigserial", "integer")).toBe(false);
      expect(typesEquivalent("smallserial", "integer")).toBe(false);
    });
  });
});
