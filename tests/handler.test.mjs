import { describe, it, expect } from "vitest";
import { handler } from "../src/handler.mjs";

describe("handler", () => {
  it("is a placeholder that syncs nothing", async () => {
    expect(await handler()).toEqual({ synced: 0 });
  });
});
