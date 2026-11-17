import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../src/source.mjs", async (importOriginal) => ({
  ...(await importOriginal()),
  fetchEntries: vi.fn(),
}));
vi.mock("../src/kvs.mjs", () => ({
  createClient: vi.fn(() => ({})),
  listAll: vi.fn(),
  applyChanges: vi.fn(),
}));

const { handler } = await import("../src/handler.mjs");
const { fetchEntries } = await import("../src/source.mjs");
const { listAll, applyChanges } = await import("../src/kvs.mjs");

const entry = (asn, category) => ({ asn, metadata: { category } });

describe("handler", () => {
  beforeEach(() => vi.clearAllMocks());

  it("writes the diff and reports counts", async () => {
    fetchEntries.mockResolvedValue([entry(1, "isp"), entry(2, "isp"), entry(3, "education_research"), entry(4, "hosting")]);
    listAll.mockResolvedValue(new Map([["1", "isp"], ["2", "education_research"], ["9", "isp"]]));
    applyChanges.mockResolvedValue(2);

    const summary = await handler();

    expect(applyChanges).toHaveBeenCalledWith(expect.anything(), undefined, {
      puts: [{ Key: "2", Value: "isp" }, { Key: "3", Value: "education_research" }],
      deletes: [{ Key: "9" }],
    });
    expect(summary).toEqual({ source: 3, store: 3, added: 1, changed: 1, removed: 1, batches: 2 });
  });

  it("does not touch the store when the download fails", async () => {
    fetchEntries.mockRejectedValue(new Error("Source download failed: HTTP 503"));
    await expect(handler()).rejects.toThrow("HTTP 503");
    expect(listAll).not.toHaveBeenCalled();
    expect(applyChanges).not.toHaveBeenCalled();
  });

  it("aborts without writing when the source is far smaller than the store", async () => {
    fetchEntries.mockResolvedValue([entry(1, "isp")]);
    listAll.mockResolvedValue(new Map(Array.from({ length: 100 }, (_, i) => [String(i), "isp"])));
    await expect(handler()).rejects.toThrow("Guardrail");
    expect(applyChanges).not.toHaveBeenCalled();
  });
});
