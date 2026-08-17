// Regression harness for the blank-popup-window fix (2026-08-17).
//
// WHY THIS EXISTS AND NOT A VITEST CASE: the bug lives entirely in BrowserWindow lifecycle —
// a popup left alive after `will-navigate` handed its only navigation to the browser. No pure
// predicate test can observe that; it needs a real Electron window. `tests/popups.test.ts`
// covers the decision table, this covers the wiring.
//
// It drives the REAL policy module (dist/main/popups.js + links.js) through the same lifecycle
// wiring index.ts uses, against a local http server standing in for the allowlisted host.
// Timings are shortened. NOTE THE LIMIT: the wiring here MIRRORS index.ts's
// wireNavigationGuards/watchPopup rather than importing them (index.ts is app-level and loads
// messenger.com on require). If you change those functions, change this too or it silently
// stops testing the shipped path.
//
// Verified 2026-08-17 to FAIL on the pre-fix code (scenarios `external` and `silent` both left
// alive=true visible=true — the blank white window) and pass after.
//
// All seven scenarios pass and all are in the `test:popups` runner. Each was verified to FAIL on
// the code before its corresponding fix — a scenario that passes both before and after pins
// nothing. `shim-direct` is the real traced bug; `call-external` is the guard rail that fails if a
// fix is too aggressive and would kill a call window.
//
// Usage: npm run build && npm run test:popups
const { app, BrowserWindow, shell, session } = require("electron");
const http = require("http");
const path = require("path");
const fs = require("fs");

const DIST = path.join(__dirname, "..", "..", "dist", "main");
const { decidePopupFallback, shouldReclaimOnExternalNavigation } = require(
  path.join(DIST, "popups.js"),
);
const { isHttpUrl, isLinkShim, externalTarget } = require(path.join(DIST, "links.js"));

// The REAL shim URL captured from Matt's session 2026-08-17 (truncated hash), and its target.
const REAL_SHIM =
  "https://l.messenger.com/l.php?u=https%3A%2F%2Fdocs.google.com%2Fdocument%2Fd%2F1_JXP5KOx" +
  "%2Fedit%3Fusp%3Dsharing&h=AUDjfjLEcqof3ACYMiWSkJgiA26k";
const REAL_TARGET = "https://docs.google.com/document/d/1_JXP5KOx/edit?usp=sharing";

const SCENARIO = process.argv[process.argv.length - 1];

// Park every harness window far offscreen. These are REAL BrowserWindows — that is the point of
// this harness — but they must never paint on the developer's display. `isVisible()` still reports
// true for an offscreen window, so every assertion below is unaffected.
const OFFSCREEN = { x: -20000, y: -20000, width: 400, height: 300, skipTaskbar: true };
const FALLBACK_MS = 400;
const MAX_WAIT_MS = 2000;

const externalCalls = [];
shell.openExternal = (url) => {
  externalCalls.push(url);
  return Promise.resolve();
};

let mainWindow = null;
let popup = null;

// --- allowlist: 127.0.0.1 stands in for messenger.com ------------------------
// messenger.com itself is ALSO allowlisted here, exactly as in config.ts — that is what makes
// `l.messenger.com` (a subdomain) an allowed popup, which is the whole mechanism of the bug.
// Without it the shim scenario would pass trivially by being treated as an external host.
const isExternalUrl = (raw) => {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return true;
    const h = u.hostname.toLowerCase();
    return h !== "127.0.0.1" && h !== "messenger.com" && !h.endsWith(".messenger.com");
  } catch {
    return true;
  }
};

const SETTLE_MS = 250; // index.ts uses 800; shortened here like the other harness timings

// --- mirrors index.ts revealedPopups + reclaimOrphanedPopup ------------------
const revealedPopups = new WeakSet();
function revealPopup(child, why) {
  if (child.isDestroyed() || revealedPopups.has(child)) return;
  revealedPopups.add(child);
  console.log(`  [reveal] why=${why}`);
  if (!child.isVisible()) child.show();
}
function reclaimOrphanedPopup(wc) {
  const win = BrowserWindow.fromWebContents(wc);
  if (!win || win.isDestroyed()) return;
  const reclaim = shouldReclaimOnExternalNavigation({
    isMainWindow: win === mainWindow,
    hasBeenRevealed: revealedPopups.has(win),
  });
  console.log(`  [reclaim] decision=${reclaim ? "destroy" : "keep"}`);
  if (!reclaim) return;
  setImmediate(() => {
    if (!win.isDestroyed()) win.destroy();
  });
}

// --- mirrors index.ts watchPopup -------------------------------------------
function watchPopup(child) {
  let settleTimer = null;
  const onNavigate = (_e, url) => {
    if (!isHttpUrl(url) || child.isDestroyed()) return;
    child.webContents.off("did-navigate", onNavigate);
    settleTimer = setTimeout(() => revealPopup(child, "settled"), SETTLE_MS);
  };
  child.webContents.on("did-navigate", onNavigate);
  const openedAt = Date.now();
  let fallback;
  const check = () => {
    if (child.isDestroyed() || child.isVisible()) return;
    const decision = decidePopupFallback({
      currentUrl: child.webContents.getURL(),
      isLoading: child.webContents.isLoading(),
      waitedMs: Date.now() - openedAt,
      maxWaitMs: MAX_WAIT_MS,
    });
    console.log(`  [watchPopup] decision=${decision}`);
    if (decision === "reveal") revealPopup(child, "fallback");
    else if (decision === "destroy") child.destroy();
    else fallback = setTimeout(check, FALLBACK_MS);
  };
  fallback = setTimeout(check, FALLBACK_MS);
  child.on("closed", () => {
    clearTimeout(fallback);
    if (settleTimer) clearTimeout(settleTimer);
  });
}

// --- mirrors index.ts wireNavigationGuards ---------------------------------
function wire(wc) {
  wc.setWindowOpenHandler(({ url, frameName }) => {
    if ((url === "about:blank" || url === "about:blank#blocked") && frameName !== "about:blank") {
      return { action: "allow", overrideBrowserWindowOptions: { show: false, ...OFFSCREEN } };
    }
    // Mirrors index.ts: a tracking link shim never becomes a popup, and the browser is handed the
    // unwrapped destination rather than the tracking URL.
    if (isLinkShim(url)) {
      void shell.openExternal(externalTarget(url));
      return { action: "deny" };
    }
    // Mirrors decideWindowOpen's final branches: an allowlisted host is ALLOWED as a popup
    // (this is how l.messenger.com became a window), everything else goes to the browser.
    if (!isExternalUrl(url)) {
      return { action: "allow", overrideBrowserWindowOptions: { show: false, ...OFFSCREEN } };
    }
    if (isHttpUrl(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  wc.on("will-navigate", (event, url) => {
    if (isExternalUrl(url)) {
      event.preventDefault();
      if (isHttpUrl(url)) void shell.openExternal(url);
      reclaimOrphanedPopup(wc);
    }
  });
  wc.on("did-create-window", (child) => {
    popup = child;
    wire(child.webContents);
    watchPopup(child);
  });
}

// --- fixture pages ----------------------------------------------------------
const server = http.createServer((req, res) => {
  const page = (body) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(`<html><body>${body}</body></html>`);
  };
  // A settled call window that LATER navigates somewhere external — someone clicked a link inside
  // the call UI. It must SURVIVE. This is the guard rail for any future fix to `interstitial`:
  // whatever rule reclaims the shim popup must not also reclaim this one.
  if (req.url.startsWith("/call-then-external")) {
    return page(
      "<h1>call window</h1><script>setTimeout(()=>{location.href=" +
        "'https://external.test.invalid/clicked-in-call';},1500);</script>",
    );
  }
  if (req.url.startsWith("/call")) return page("<h1>call window</h1>");
  // A link-shim interstitial on an ALLOWLISTED host that immediately bounces to an external URL —
  // the `l.messenger.com/l.php?u=…` shape. It COMMITS, so the popup is revealed and no longer
  // looks uncommitted to reclaimOrphanedPopup.
  if (req.url.startsWith("/interstitial")) {
    return page(
      `<script>location.href='https://external.test.invalid/drive';</script>Redirecting\u2026`,
    );
  }
  // A deliberately SLOW attachment: headers withheld past the reveal fallback, so the fallback
  // is guaranteed to run while the request is still in flight. This is the one path where the
  // new `destroy` is more aggressive than the old `show` — if the popup were destroyed here,
  // the download would die with it.
  if (req.url.startsWith("/slow-download")) {
    return setTimeout(() => {
      res.writeHead(200, {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": 'attachment; filename="harness-fixture.bin"',
      });
      res.write("first-half;");
      setTimeout(() => res.end("second-half"), 800);
    }, 1200);
  }
  if (req.url.startsWith("/opener")) {
    const port = server.address().port;
    const target =
      SCENARIO === "external"
        ? "https://external.test.invalid/thing"
        : SCENARIO === "download"
          ? `http://127.0.0.1:${port}/slow-download`
          : SCENARIO === "interstitial"
            ? `http://127.0.0.1:${port}/interstitial`
            : SCENARIO === "call-external"
              ? `http://127.0.0.1:${port}/call-then-external`
              : `http://127.0.0.1:${port}/call`;
    if (SCENARIO === "shim-direct") {
      // THE REAL SHAPE from the trace: window.open() straight to the l.messenger.com shim.
      return page(`<script>window.open(${JSON.stringify(REAL_SHIM)});</script>`);
    }
    if (SCENARIO === "silent") {
      // Popup opened and simply abandoned — never assigned a location.
      return page("<script>window.open('about:blank');</script>");
    }
    return page(
      `<script>const w=window.open('about:blank');setTimeout(()=>{w.location=${JSON.stringify(
        target,
      )};},200);</script>`,
    );
  }
  page("ok");
});

const EXPECT = {
  // THE BUG: popup opened as about:blank, location assigned to an external URL. The link must
  // reach the browser AND the popup must not survive as a blank window.
  external: { alive: false, visible: false, external: 1 },
  // THE CALLS GATE (proxy): popup commits an allowlisted URL, exactly as a voice/video call
  // popup commits messenger.com/groupcall/…. It must be revealed and left alive.
  allowed: { alive: true, visible: true, external: 0 },
  // Popup opened and abandoned — must be reclaimed by the fallback, not shown blank.
  silent: { alive: false, visible: false, external: 0 },
  // DOWNLOADS: popup whose navigation becomes a slow download. The fallback fires while the
  // request is still in flight, so `wait` (isLoading) must hold long enough for will-download
  // to take over. The popup must end up gone AND the download must complete.
  download: { alive: false, visible: false, external: 0, downloadState: "completed" },
  // THE SECOND SHAPE (Matt, 2026-08-17: drive.google.com still leaves a blank window). Popup
  // commits an allowlisted link-shim page, is revealed, THEN goes external. The link must reach
  // the browser and the shim window must not be left sitting there.
  interstitial: { alive: false, visible: false, external: 1 },
  // THE GUARD RAIL: a settled call window whose user clicked an external link. The link goes to
  // the browser and the call window MUST survive. Any fix for `interstitial` that breaks this has
  // traded a cosmetic bug for a dropped call.
  "call-external": { alive: true, visible: true, external: 1 },
  // THE ACTUAL BUG, in its real traced shape: window.open() directly to the l.messenger.com
  // tracking shim. No window may be created at all, and the browser must receive the UNWRAPPED
  // destination (docs.google.com), not the tracking URL.
  "shim-direct": { popupCreated: false, external: 1, externalUrl: REAL_TARGET },
};

app.whenReady().then(() => {
  // Mirrors index.ts configureSession's will-download handler: park the file and destroy the
  // popup whose navigation became the download (it was created hidden).
  let downloadState = "none";
  session.defaultSession.on("will-download", (_event, item, webContents) => {
    downloadState = "started";
    item.setSavePath(path.join(app.getPath("temp"), `harness-${Date.now()}.bin`));
    item.once("done", (_e, state) => {
      downloadState = state;
      try {
        fs.unlinkSync(item.getSavePath());
      } catch {
        /* fixture cleanup is best-effort */
      }
    });
    const win = BrowserWindow.fromWebContents(webContents);
    if (win && win !== mainWindow && !isHttpUrl(webContents.getURL())) win.destroy();
  });

  server.listen(0, "127.0.0.1", () => {
    const port = server.address().port;
    mainWindow = new BrowserWindow({
      show: false,
      ...OFFSCREEN,
      webPreferences: { sandbox: true },
    });
    wire(mainWindow.webContents);
    mainWindow.loadURL(`http://127.0.0.1:${port}/opener`);

    setTimeout(() => {
      const alive = !!popup && !popup.isDestroyed();
      const visible = alive && popup.isVisible();
      const want = EXPECT[SCENARIO];
      const got = { alive, visible, external: externalCalls.length };
      if ("downloadState" in want) got.downloadState = downloadState;
      if ("popupCreated" in want) got.popupCreated = !!popup;
      if ("externalUrl" in want) got.externalUrl = externalCalls[0];
      for (const k of Object.keys(got)) if (!(k in want)) delete got[k];
      const pass = Object.keys(want).every((k) => got[k] === want[k]);
      console.log(`  popupCreated=${!!popup} got=${JSON.stringify(got)}`);
      console.log(`  want=${JSON.stringify(want)}`);
      console.log(`RESULT ${SCENARIO}: ${pass ? "PASS" : "FAIL"}`);
      app.exit(pass ? 0 : 1);
    }, 5000);
  });
});
