#!/usr/bin/env node
/**
 * Install the freshly packed Messenger.app into /Applications.
 *
 * Runs automatically at the end of `npm run pack`. Set MERCURY_NO_INSTALL=1 to pack without
 * installing (e.g. when you only want the artifact, or the app is mid-call).
 *
 * No sudo required: /Applications is root:admin drwxrwxr-x and the owner is in `admin`. The
 * script refuses rather than escalates if that ever stops being true.
 *
 * Why the app is quit GRACEFULLY rather than killed: window geometry is written in the
 * BrowserWindow "close" handler (src/main/index.ts → saveWindowBounds). SIGKILL loses it. We ask
 * via the bundle id, poll, and only escalate to a signal for the exact PIDs running THIS bundle —
 * never a name glob, which cannot tell our app from anything else called "Messenger".
 */
const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const BUNDLE_ID = "com.mercury.messenger";
const APP_NAME = "Messenger.app";
const SRC = path.join(__dirname, "..", "release", "mac-arm64", APP_NAME);
const DEST = path.join("/Applications", APP_NAME);
const ROLLBACK = path.join(os.homedir(), "Quarantine", `${APP_NAME}.previous`);

const log = (msg) => console.log(`  • install-app  ${msg}`);
const die = (msg) => {
  console.error(`  ✗ install-app  ${msg}`);
  process.exit(1);
};

if (process.env.MERCURY_NO_INSTALL) {
  log("MERCURY_NO_INSTALL set — skipping /Applications install");
  process.exit(0);
}
if (process.platform !== "darwin") {
  log(`not macOS (${process.platform}) — skipping`);
  process.exit(0);
}
if (!fs.existsSync(SRC)) die(`no packed app at ${SRC} — run \`npm run pack\``);

// Never replace a working install with a broken build.
const verify = spawnSync("codesign", ["--verify", "--strict", SRC], { encoding: "utf8" });
if (verify.status !== 0) {
  die(
    `packed app fails signature verification, refusing to install:\n${verify.stderr.trim()}\n` +
      `    Build with CSC_NAME="Mercury Dev" — ad-hoc builds break notifications and reset TCC.`,
  );
}
log("packed app signature verified");

// --- quit any running instance of THIS bundle -------------------------------
/** PIDs whose executable lives inside a Messenger.app bundle we own (installed or freshly built). */
function runningPids() {
  const out = spawnSync("ps", ["-axo", "pid=,comm="], { encoding: "utf8" }).stdout || "";
  return out
    .split("\n")
    .map((line) => line.trim().match(/^(\d+)\s+(.*)$/))
    .filter(Boolean)
    .filter(([, , comm]) => comm.startsWith(DEST + "/") || comm.startsWith(SRC + "/"))
    .map(([, pid]) => Number(pid));
}

const sleep = (ms) => execFileSync("/bin/sleep", [String(ms / 1000)]);

let pids = runningPids();
if (pids.length > 0) {
  log(`quitting running app (${pids.length} process(es))`);
  // Graceful: lets the close handler persist window geometry.
  spawnSync("osascript", ["-e", `tell application id "${BUNDLE_ID}" to quit`], {
    encoding: "utf8",
  });
  for (let i = 0; i < 50 && runningPids().length > 0; i++) sleep(200);
  pids = runningPids();
  if (pids.length > 0) {
    log(`still running after 10s — sending SIGTERM to ${pids.join(", ")}`);
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGTERM");
      } catch {
        /* already gone */
      }
    }
    for (let i = 0; i < 25 && runningPids().length > 0; i++) sleep(200);
  }
  if (runningPids().length > 0) die("app would not exit; install aborted (nothing was changed)");
  log("app quit cleanly");
}

// --- swap in the new build --------------------------------------------------
if (!canWrite("/Applications")) {
  die(
    "/Applications is not writable by this user. Install manually by dragging\n" +
      `    ${SRC}\n    into /Applications.`,
  );
}

function canWrite(dir) {
  try {
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// Keep exactly ONE rollback copy — quarantine rather than delete, but don't grow without bound.
if (fs.existsSync(DEST)) {
  fs.mkdirSync(path.dirname(ROLLBACK), { recursive: true });
  fs.rmSync(ROLLBACK, { recursive: true, force: true });
  fs.renameSync(DEST, ROLLBACK);
  log(`previous install moved to ${ROLLBACK}`);
}

// ditto, not cp -R: preserves the code signature, extended attributes and symlinks intact.
const copy = spawnSync("ditto", [SRC, DEST], { encoding: "utf8" });
if (copy.status !== 0) {
  // Put the old one back rather than leaving the user with no app at all.
  if (fs.existsSync(ROLLBACK) && !fs.existsSync(DEST)) fs.renameSync(ROLLBACK, DEST);
  die(`ditto failed, previous install restored:\n${copy.stderr.trim()}`);
}

const installed = spawnSync("codesign", ["--verify", "--strict", DEST], { encoding: "utf8" });
if (installed.status !== 0) die(`installed copy fails verification:\n${installed.stderr.trim()}`);

log(`installed → ${DEST} (signature verified)`);
log(`rollback available at ${ROLLBACK}`);
