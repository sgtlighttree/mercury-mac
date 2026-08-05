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
- **`pnpm run build`** now does `rm -rf dist` + full typecheck (`tsc --noEmit`) + emit of only
  the files main requires (`tsc -p tsconfig.build.json`, excludes `src/preload/`) + the esbuild
  preload bundle. No dead/duplicate files ship in the asar.
- `app.isPackaged` replaces the `NODE_ENV !== "production"` guard for dev-only console logging
  (NODE_ENV is unset in packaged builds).

## Signing — REQUIRED, not optional (updated 2026-07-11)

Build with the self-signed "Mercury Dev" identity (login keychain, trusted for code signing):

```bash
CSC_NAME="Mercury Dev" pnpm run dist
```

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
