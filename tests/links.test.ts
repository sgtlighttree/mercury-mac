import { describe, it, expect } from "vitest";
import { isExternalUrl, isHttpUrl, decideWindowOpen, isPopupExternalHost, unwrapLinkShim, isLinkShim, externalTarget } from "../src/main/links";

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

  // Facebook content links: allowlisted for in-place navigation, never as an in-app popup.
  it("opens a Facebook share/redirect link externally (the observed real-world shape)", () => {
    // Exactly what messenger.com handed us on 2026-07-27 — note it is NOT a /posts/ URL,
    // which is why this is a host rule and not a path rule.
    expect(decideWindowOpen("https://www.facebook.com/share/r/1ETfmkj2u4/", "")).toBe("open-external");
  });
  it("opens a Facebook post permalink externally", () => {
    expect(decideWindowOpen("https://www.facebook.com/someone/posts/123", "")).toBe("open-external");
  });
  it("opens a bare facebook.com link externally", () => {
    expect(decideWindowOpen("https://facebook.com/watch/?v=1", "")).toBe("open-external");
  });
  it("opens facebook.com subdomains externally too", () => {
    expect(decideWindowOpen("https://m.facebook.com/story.php?id=1", "")).toBe("open-external");
  });

  // CALLS-GATE REGRESSION GUARDS — the calls gate (docs/CALLS-RESULT.md) depends on the
  // about:blank branch running BEFORE the facebook.com popup rule. If someone reorders
  // decideWindowOpen, these fail loudly rather than silently breaking voice/video calls.
  it("still allows the about:blank call popup AFTER the facebook popup rule was added", () => {
    expect(decideWindowOpen("about:blank", "")).toBe("allow");
  });
  it("still allows group-chat download popups on fbsbx.com", () => {
    expect(decideWindowOpen("https://cdn.fbsbx.com/v/attachment.pdf", "")).toBe("allow");
  });
  it("still allows media popups on fbcdn.net", () => {
    expect(decideWindowOpen("https://scontent.fbcdn.net/v/photo.jpg", "")).toBe("allow");
  });
});

describe("isPopupExternalHost", () => {
  it("matches facebook.com and its subdomains", () => {
    expect(isPopupExternalHost("https://www.facebook.com/share/r/abc/")).toBe(true);
    expect(isPopupExternalHost("https://facebook.com/x")).toBe(true);
  });
  it("does not match messenger.com or the media CDNs", () => {
    expect(isPopupExternalHost("https://www.messenger.com/t/123")).toBe(false);
    expect(isPopupExternalHost("https://scontent.fbcdn.net/v/x.jpg")).toBe(false);
    expect(isPopupExternalHost("https://cdn.fbsbx.com/v/x.pdf")).toBe(false);
  });
  it("does not match a lookalike host that merely ends in the same string", () => {
    expect(isPopupExternalHost("https://notfacebook.com/x")).toBe(false);
    expect(isPopupExternalHost("https://evil-facebook.com.attacker.net/x")).toBe(false);
  });
  it("returns false for about:blank and non-http schemes so they fall through", () => {
    expect(isPopupExternalHost("about:blank")).toBe(false);
    expect(isPopupExternalHost("javascript:void(0)")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Link shim (the blank-window bug). URLs below are the REAL shape captured from
// Matt's session on 2026-08-17, not invented fixtures.
// ---------------------------------------------------------------------------
describe("link shim unwrapping", () => {
  const REAL_SHIM =
    "https://l.messenger.com/l.php?u=https%3A%2F%2Fdocs.google.com%2Fdocument%2Fd%2F1_JXP5KOxvJ_d2Zp5z3eEZpjdZLksJld_K6MavXWGJyE%2Fedit%3Fusp%3Dsharing&h=AUDjfjLEcqof3ACYMiWSkJgiA26k";
  const REAL_TARGET =
    "https://docs.google.com/document/d/1_JXP5KOxvJ_d2Zp5z3eEZpjdZLksJld_K6MavXWGJyE/edit?usp=sharing";

  it("unwraps the real l.messenger.com shim from the 2026-08-17 trace", () => {
    expect(unwrapLinkShim(REAL_SHIM)).toBe(REAL_TARGET);
  });

  it("sends that shim to the browser instead of opening a popup (THE BUG)", () => {
    expect(decideWindowOpen(REAL_SHIM, "")).toBe("open-external");
  });

  it("hands the browser the real destination, not the tracking URL", () => {
    expect(externalTarget(REAL_SHIM)).toBe(REAL_TARGET);
  });

  it("handles l.facebook.com and the /flx/warn interstitial too", () => {
    expect(unwrapLinkShim("https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Fa&h=AT")).toBe(
      "https://example.com/a",
    );
    expect(
      unwrapLinkShim("https://www.facebook.com/flx/warn/?u=https%3A%2F%2Fexample.com%2Fb&h=AT"),
    ).toBe("https://example.com/b");
  });

  it("never unwraps a non-http(s) payload into shell.openExternal", () => {
    // `u` is attacker-influenced and destined for the shell — this is the security boundary.
    expect(unwrapLinkShim("https://l.messenger.com/l.php?u=javascript%3Aalert(1)")).toBeNull();
    expect(unwrapLinkShim("https://l.messenger.com/l.php?u=file%3A%2F%2F%2Fetc%2Fpasswd")).toBeNull();
    expect(externalTarget("https://l.messenger.com/l.php?u=javascript%3Aalert(1)")).toBe(
      "https://l.messenger.com/l.php?u=javascript%3Aalert(1)",
    );
  });

  it("leaves ordinary URLs and non-shims alone", () => {
    expect(unwrapLinkShim("https://www.messenger.com/t/123/")).toBeNull();
    expect(unwrapLinkShim("https://l.messenger.com/other")).toBeNull();
    expect(unwrapLinkShim("https://l.messenger.com/l.php")).toBeNull();
    expect(externalTarget("https://drive.google.com/x")).toBe("https://drive.google.com/x");
  });

  it("does not disturb the calls path: about:blank still wins", () => {
    expect(decideWindowOpen("about:blank", "")).toBe("allow");
    expect(isLinkShim("about:blank")).toBe(false);
  });
});
