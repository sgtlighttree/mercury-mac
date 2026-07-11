import { describe, it, expect } from "vitest";
import { parseWindowBounds, DEFAULT_BOUNDS } from "../src/main/window-state";

describe("parseWindowBounds", () => {
  it("round-trips valid bounds", () => {
    expect(parseWindowBounds('{"x":10,"y":20,"width":1200,"height":900}')).toEqual({
      x: 10, y: 20, width: 1200, height: 900,
    });
  });
  it("accepts bounds without a position", () => {
    expect(parseWindowBounds('{"width":800,"height":600}')).toEqual({ width: 800, height: 600 });
  });
  it("falls back on malformed JSON", () => {
    expect(parseWindowBounds("not json {")).toEqual(DEFAULT_BOUNDS);
  });
  it("falls back on implausibly small sizes", () => {
    expect(parseWindowBounds('{"width":10,"height":10}')).toEqual(DEFAULT_BOUNDS);
  });
  it("falls back on non-numeric fields", () => {
    expect(parseWindowBounds('{"width":"wide","height":600}')).toEqual(DEFAULT_BOUNDS);
  });
});
