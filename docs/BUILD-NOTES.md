# Build Notes (v0.1.0 MVP)

- Electron: 43.3.0  electron-builder: 25.1.8
- .app size: 275M (2026-08-05 rebuild, `--mac dir`)   dmg size: 114M
- **Calls gate re-passed on the hardened build** (2026-08-05): installed the signed dmg,
  voice+video calls + screen share verified working after the fuses/ATS/Electron changes.

## Security hardening (2026-08-05)

- **Electron 43.3.0** (was 43.1.0): fixes CVE-2026-54257 / the Apple Silicon UTF-8 bug — an LLVM
  miscompile (ThinLTO on M-family CPUs) that silently truncates `TextEncoder.encode()` /
  `Buffer.byteLength` for non-ASCII strings and crashes `fs.writeFileSync`. Fixed in 42.3.3,
  backported to the 43 line only in 43.3.0. Messenger's in-page crypto runs TextEncoder, so this
  was an integrity risk on the M1.
- **Electron fuses hardened** in `scripts/after-pack.cjs` (an electron-builder `afterPack` hook,
  runs before signing so the signature covers the change): `RunAsNode`, 
  `EnableNodeOptionsEnvironmentVariable`, and `EnableNodeCliInspectArguments` are all DISABLED —
  `ELECTRON_RUN_AS_NODE`, `NODE_OPTIONS`, and `--inspect` become inert in the packaged app.
- **`NSAllowsArbitraryLoads=false`** forced via the same hook: electron-builder hardcodes it to
  `true` and `extendInfo` cannot override it (`configureLocalhostAts`). Inert for Chromium's
  network stack, but keeps any NSURLSession-based code on ATS defaults.
- **`npm run build`** now does `rm -rf dist` + full typecheck (`tsc --noEmit`) + emit of only
  the files main requires (`tsc -p tsconfig.build.json`, excludes `src/preload/`) + the esbuild
  preload bundle. No dead/duplicate files ship in the asar.
- `app.isPackaged` replaces the `NODE_ENV !== "production"` guard for dev-only console logging
  (NODE_ENV is unset in packaged builds).

## Signing — REQUIRED, not optional (updated 2026-07-11)

Build with the self-signed "Mercury Dev" identity (login keychain, trusted for code signing):

```bash
CSC_NAME="Mercury Dev" npm run pack   # DEFAULT → .app, installed into /Applications
CSC_NAME="Mercury Dev" npm run dist   # only when a .dmg is actually needed
MERCURY_NO_INSTALL=1 CSC_NAME="Mercury Dev" npm run pack   # pack without installing
```

`pack` ends by running `scripts/install-app.cjs`, which quits any running instance and swaps the
new build into `/Applications`. **No sudo** — `/Applications` is `root:admin drwxrwxr-x` and the
owner is in `admin` (verified 2026-08-17). Safety properties, all exercised:

- **Signature is verified before `/Applications` is touched**, so a broken build cannot replace a
  working install. Tested by tampering with `app.asar`: refused, install untouched.
- **Graceful quit, not SIGKILL** — window geometry is saved in the BrowserWindow `close` handler,
  so killing hard would lose it. Asks via bundle id, polls 10s, then SIGTERMs the exact PIDs of
  that bundle. Never a process-name glob. Verified: `window-state.json` survived the swap.
- **The previous install is rotated to `~/Quarantine/Messenger.app.previous`**, not deleted — one
  copy, so it doesn't grow without bound. If `ditto` fails, it is restored automatically.
- **TCC grants are expected to survive** the swap — same bundle id, same `/Applications` path, same
  "Mercury Dev" signing identity, which is exactly the stable-signature property that made grants
  survive rebuilds in Session 02. Reasoned, **not separately verified for the install swap**: if
  macOS re-prompts for mic/camera on first launch after an install, that assumption was wrong and
  this line should be corrected.

**Owner's rule (2026-08-17): `.app` only by default; no `.dmg` unless asked for.** The dmg step is
slow and single-threaded, and `pack` already puts the app where it needs to be. Both scripts run
the same `afterPack` hook, so the hardening below applies to the `.app` in either case — `pack` is
not a weaker build. (`dist` builds the dmg but does **not** run the install step.)

Why signing is mandatory here, learned the hard way:
- **Ad-hoc builds cannot register with macOS Notification Center** — even main-process
  notifications fail with `UNErrorDomain error 1` and the app never appears in System
  Settings → Notifications.
- **Ad-hoc signatures change every rebuild**, so TCC grants (mic/camera/screen) reset each
  time; the stable Mercury Dev signature persists them.
- Signing enables hardened runtime, which then **requires** the entitlements in
  `build/entitlements.mac.plist`: `allow-jit`, `allow-unsigned-executable-memory`, and
  crucially `disable-library-validation` — without the last one the app **crashes on
  launch** ("different Team IDs" dyld abort), because a self-signed cert has no Team ID and
  Library Validation refuses to load Electron Framework.

Gatekeeper note: locally built dmgs carry no quarantine xattr, so no Gatekeeper prompt
appears on this machine. The right-click → Open advice only applies to *downloaded* copies.

- RAM (running, logged in): **~635MB average** across the Messenger processes (measured by
  Matt via Activity Monitor, 2026-07-12, packaged app). Within the honest expectation: the
  site, not the shell, dominates.
- On-disk profile (userData) after ~2 days of use: **~426MB** — breakdown and paths in
  `ARCHITECTURE.md` (§ Where the app stores its data).
