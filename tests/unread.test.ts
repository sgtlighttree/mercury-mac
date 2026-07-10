import { describe, it, expect } from "vitest";
import { parseUnreadCount } from "../src/preload/unread";

describe("parseUnreadCount", () => {
  it("parses a leading count", () => {
    expect(parseUnreadCount("(3) Messenger")).toBe(3);
  });
  it("parses a capped count like (12+)", () => {
    expect(parseUnreadCount("(12+) Messenger")).toBe(12);
  });
  it("returns 0 when there is no count", () => {
    expect(parseUnreadCount("Messenger")).toBe(0);
  });
  it("returns 0 for an empty title", () => {
    expect(parseUnreadCount("")).toBe(0);
  });
});
