import { describe, it, expect } from "vitest";
import { isExternalUrl, isHttpUrl, decideWindowOpen } from "../src/main/links";

describe("isExternalUrl", () => {
  it("keeps messenger.com internal", () => {
    expect(isExternalUrl("https://www.messenger.com/t/123")).toBe(false);
  });
  it("keeps facebook login/2FA internal", () => {
    expect(isExternalUrl("https://www.facebook.com/checkpoint/")).toBe(false);
  });
  it("keeps fbcdn media subdomains internal", () => {
    expect(isExternalUrl("https://scontent.fbcdn.net/v/x.jpg")).toBe(false);
  });
  it("routes a shared external link out", () => {
    expect(isExternalUrl("https://example.com/article")).toBe(true);
  });
  it("treats an unparseable or non-http value as external (never navigate the app to it)", () => {
    expect(isExternalUrl("javascript:void(0)")).toBe(true);
  });
});

describe("isHttpUrl", () => {
  it("accepts http(s) schemes case-insensitively", () => {
    expect(isHttpUrl("HTTPS://example.com/A")).toBe(true);
  });
  it("rejects non-http schemes", () => {
    expect(isHttpUrl("javascript:void(0)")).toBe(false);
  });
});

describe("decideWindowOpen", () => {
  it("allows an about:blank call/download popup", () => {
    expect(decideWindowOpen("about:blank", "")).toBe("allow");
  });
  it("allows an about:blank#blocked call/download popup", () => {
    expect(decideWindowOpen("about:blank#blocked", "")).toBe("allow");
  });
  it("drops about:blank when frameName is also about:blank (Caprine's junk-popup exception)", () => {
    expect(decideWindowOpen("about:blank", "about:blank")).toBe("drop");
  });
  it("allows internal messenger.com navigation", () => {
    expect(decideWindowOpen("https://www.messenger.com/t/123", "")).toBe("allow");
  });
  it("opens external http(s) links externally", () => {
    expect(decideWindowOpen("https://example.com/x", "")).toBe("open-external");
  });
  it("drops non-http external schemes", () => {
    expect(decideWindowOpen("javascript:void(0)", "")).toBe("drop");
  });
});
