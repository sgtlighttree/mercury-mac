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
// Usage: npm run build && npm run test:popups
const { app, BrowserWindow, shell, session } = require("electron");
const http = require("http");
const path = require("path");
const fs = require("fs");

const DIST = path.join(__dirname, "..", "..", "dist", "main");
const { isUncommittedPopup, decidePopupFallback } = require(path.join(DIST, "popups.js"));
const { isHttpUrl } = require(path.join(DIST, "links.js"));

const SCENARIO = process.argv[process.argv.length - 1];
const FALLBACK_MS = 400;
const MAX_WAIT_MS = 2000;

const externalCalls = [];
shell.openExternal = (url) => {
  externalCalls.push(url);
  return Promise.resolve();
};

let mainWindow = null;
let popup = null;

// --- allowlist: 127.0.0.1 stands in for messenger.com -----------------------
const isExternalUrl = (raw) => {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return true;
    return u.hostname.toLowerCase() !== "127.0.0.1";
  } catch {
    return true;
  }
};

// --- mirrors index.ts reclaimOrphanedPopup ---------------------------------
function reclaimOrphanedPopup(wc) {
  const win = BrowserWindow.fromWebContents(wc);
  if (!win || win === mainWindow || win.isDestroyed()) return;
  if (!isUncommittedPopup(wc.getURL())) return;
  setImmediate(() => {
    if (!win.isDestroyed()) win.destroy();
  });
}

// --- mirrors index.ts watchPopup -------------------------------------------
function watchPopup(child) {
  const onNavigate = (_e, url) => {
    if (!isHttpUrl(url) || child.isDestroyed()) return;
    child.webContents.off("did-navigate", onNavigate);
    if (!child.isVisible()) child.show();
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
    if (decision === "reveal") child.show();
    else if (decision === "destroy") child.destroy();
    else fallback = setTimeout(check, FALLBACK_MS);
  };
  fallback = setTimeout(check, FALLBACK_MS);
  child.on("closed", () => clearTimeout(fallback));
}

// --- mirrors index.ts wireNavigationGuards ---------------------------------
function wire(wc) {
  wc.setWindowOpenHandler(({ url, frameName }) => {
    if ((url === "about:blank" || url === "about:blank#blocked") && frameName !== "about:blank") {
      return { action: "allow", overrideBrowserWindowOptions: { show: false } };
    }
    if (isExternalUrl(url) && isHttpUrl(url)) void shell.openExternal(url);
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
  if (req.url.startsWith("/call")) return page("<h1>call window</h1>");
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
          : `http://127.0.0.1:${port}/call`;
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
    mainWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    wire(mainWindow.webContents);
    mainWindow.loadURL(`http://127.0.0.1:${port}/opener`);

    setTimeout(() => {
      const alive = !!popup && !popup.isDestroyed();
      const visible = alive && popup.isVisible();
      const want = EXPECT[SCENARIO];
      const got = { alive, visible, external: externalCalls.length };
      if ("downloadState" in want) got.downloadState = downloadState;
      const pass = Object.keys(want).every((k) => got[k] === want[k]);
      console.log(`  popupCreated=${!!popup} got=${JSON.stringify(got)}`);
      console.log(`  want=${JSON.stringify(want)}`);
      console.log(`RESULT ${SCENARIO}: ${pass ? "PASS" : "FAIL"}`);
      app.exit(pass ? 0 : 1);
    }, 5000);
  });
});
