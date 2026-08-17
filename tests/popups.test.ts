import { describe, it, expect } from "vitest";
import { isUncommittedPopup, decidePopupFallback } from "../src/main/popups";

const state = (over: Partial<Parameters<typeof decidePopupFallback>[0]> = {}) => ({
  currentUrl: "about:blank",
  isLoading: false,
  waitedMs: 5000,
  maxWaitMs: 30000,
  ...over,
});

describe("isUncommittedPopup", () => {
  it("treats the about:blank placeholder as uncommitted", () => {
    expect(isUncommittedPopup("about:blank")).toBe(true);
  });

  it("treats an empty URL as uncommitted", () => {
    expect(isUncommittedPopup("")).toBe(true);
  });

  it("treats a committed http(s) page as committed", () => {
    expect(isUncommittedPopup("https://www.messenger.com/groupcall/ROOM:123/")).toBe(false);
    expect(isUncommittedPopup("http://example.com/")).toBe(false);
  });
});

describe("decidePopupFallback", () => {
  it("destroys a popup that committed nothing and is not loading (the blank-window bug)", () => {
    expect(decidePopupFallback(state())).toBe("destroy");
  });

  // CALLS GATE: a call popup opens as about:blank and commits its groupcall URL later. On a
  // slow network it looks exactly like a dead popup by URL alone — isLoading is the difference.
  it("waits on an uncommitted popup that is still loading", () => {
    expect(decidePopupFallback(state({ isLoading: true }))).toBe("wait");
  });

  it("reveals a popup that committed a real page but was never shown", () => {
    expect(
      decidePopupFallback(
        state({ currentUrl: "https://www.messenger.com/groupcall/ROOM:123/?is_e2ee_mandated=true" }),
      ),
    ).toBe("reveal");
  });

  it("reveals a committed popup even while it is still loading", () => {
    expect(
      decidePopupFallback(state({ currentUrl: "https://www.messenger.com/x", isLoading: true })),
    ).toBe("reveal");
  });

  it("stops waiting on a wedged popup once maxWaitMs is reached", () => {
    expect(decidePopupFallback(state({ isLoading: true, waitedMs: 30000 }))).toBe("destroy");
    expect(decidePopupFallback(state({ isLoading: true, waitedMs: 45000 }))).toBe("destroy");
  });

  it("keeps waiting right up to the deadline", () => {
    expect(decidePopupFallback(state({ isLoading: true, waitedMs: 29999 }))).toBe("wait");
  });
});
