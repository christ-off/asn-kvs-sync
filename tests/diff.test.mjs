import { describe, it, expect } from "vitest";
import { computeDiff, checkGuardrail, chunk } from "../src/diff.mjs";

describe("computeDiff", () => {
  it("puts new and changed keys, deletes removed ones", () => {
    const current = new Map([["1", "h"], ["2", "b"], ["3", "i"]]);
    const desired = new Map([["1", "h"], ["2", "i"], ["4", "e"]]);
    expect(computeDiff(current, desired)).toEqual({
      puts: [{ Key: "2", Value: "i" }, { Key: "4", Value: "e" }],
      deletes: [{ Key: "3" }],
    });
  });

  it("is empty when nothing changed", () => {
    const m = new Map([["1", "h"]]);
    expect(computeDiff(m, new Map(m))).toEqual({ puts: [], deletes: [] });
  });

});

describe("checkGuardrail", () => {
  const store = (n) => new Map(Array.from({ length: n }, (_, i) => [String(i), "h"]));

  it("rejects an empty source", () => {
    expect(() => checkGuardrail(store(10), new Map())).toThrow("empty");
  });

  it("rejects a source below 90% of the store", () => {
    expect(() => checkGuardrail(store(100), store(89))).toThrow("Guardrail");
  });

  it("accepts a source at 90% or more, and any source for an empty store", () => {
    expect(() => checkGuardrail(store(100), store(90))).not.toThrow();
    expect(() => checkGuardrail(new Map(), store(5))).not.toThrow();
  });
});

describe("chunk", () => {
  it("splits into batches of at most the given size", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 50)).toEqual([]);
  });
});
