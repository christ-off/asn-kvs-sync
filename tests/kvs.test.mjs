import { describe, it, expect, vi } from "vitest";
import { listAll, applyChanges } from "../src/kvs.mjs";

describe("listAll", () => {
  it("follows NextToken across pages", async () => {
    const send = vi.fn()
      .mockResolvedValueOnce({ Items: [{ Key: "1", Value: "h" }], NextToken: "t" })
      .mockResolvedValueOnce({ Items: [{ Key: "2", Value: "i" }] });
    const items = await listAll({ send }, "arn");
    expect([...items]).toEqual([["1", "h"], ["2", "i"]]);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("handles an empty store", async () => {
    expect((await listAll({ send: vi.fn().mockResolvedValue({}) }, "arn")).size).toBe(0);
  });
});

describe("applyChanges", () => {
  it("batches by 50 and chains the ETag", async () => {
    const send = vi.fn().mockImplementation(async (cmd) =>
      cmd.input.IfMatch === undefined ? { ETag: "e0" } : { ETag: `${cmd.input.IfMatch}+` });
    const puts = Array.from({ length: 120 }, (_, i) => ({ Key: String(i), Value: "h" }));
    const deletes = [{ Key: "x" }];
    const batches = await applyChanges({ send }, "arn", { puts, deletes });
    expect(batches).toBe(4);
    const updates = send.mock.calls.slice(1).map(([c]) => c.input);
    expect(updates.map((u) => u.IfMatch)).toEqual(["e0", "e0+", "e0++", "e0+++"]);
    expect(updates.map((u) => (u.Puts ?? u.Deletes).length)).toEqual([50, 50, 20, 1]);
  });

  it("does nothing but describe when there are no changes", async () => {
    const send = vi.fn().mockResolvedValue({ ETag: "e" });
    expect(await applyChanges({ send }, "arn", { puts: [], deletes: [] })).toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
  });
});
