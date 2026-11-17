import { describe, it, expect, vi } from "vitest";
import { toCategoryMap, fetchEntries } from "../src/source.mjs";

describe("toCategoryMap", () => {
  it("keeps the category name and skips uncategorised ASNs", () => {
    const { map, unknown } = toCategoryMap([
      { asn: 24940, metadata: { category: "hosting" } },
      { asn: 60653, metadata: { category: "business" } },
      { asn: 7, metadata: {} },
      { asn: 8 },
    ]);
    expect([...map]).toEqual([["24940", "hosting"], ["60653", "business"]]);
    expect(unknown.size).toBe(0);
  });

  it("counts unknown categories instead of dropping them silently", () => {
    const { map, unknown } = toCategoryMap([
      { asn: 1, metadata: { category: "satellite" } },
      { asn: 2, metadata: { category: "satellite" } },
    ]);
    expect(map.size).toBe(0);
    expect(unknown.get("satellite")).toBe(2);
  });
});

describe("fetchEntries", () => {
  it("returns the parsed array", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ asn: 1 }] });
    expect(await fetchEntries("http://x", fetchFn)).toEqual([{ asn: 1 }]);
  });

  it("throws on HTTP errors and non-array bodies", async () => {
    await expect(fetchEntries("u", vi.fn().mockResolvedValue({ ok: false, status: 503 }))).rejects.toThrow("503");
    await expect(fetchEntries("u", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }))).rejects.toThrow("array");
  });
});
