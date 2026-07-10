import { describe, it, expect } from "vitest";
import { isExternalUrl, isHttpUrl } from "../src/main/links";

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
