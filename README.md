# Mercury — a lightweight-for-Electron Messenger desktop client

A minimal macOS desktop wrapper for [messenger.com](https://www.messenger.com), built with
Electron. It's a thin native shell around the real Messenger web app, not a reimplementation:
almost all product behavior (chat, notifications badge text, calls) comes straight from the site
itself.

## Why Electron, not something smaller

An earlier prototype used Tauri (WebKit). It was dropped because Facebook Messenger's voice/video
calls depend on a Chrome-only WebRTC API (`createEncodedStreams`) that WebKit does not implement —
so a WebKit-based wrapper can never support calls. Electron (Chromium) is the smallest engine that
can. "Lightweight" here means *best-in-class for an Electron app* (single window, `arm64`-only
build, `en`-only locales, latest Electron) — not Tauri-scale numbers. See
[`docs/BUILD-NOTES.md`](docs/BUILD-NOTES.md) for real, measured disk/RAM footprint; we don't
market unverified numbers.

## Status: calls verified working

Voice and video calls work **bidirectionally** (made and received), in both dev (`pnpm start`)
and packaged builds, and in-call screen share works (whole screen only). The calls gate
**PASSED** on 2026-07-11 — full evidence and the root-cause trail in
[`docs/CALLS-RESULT.md`](docs/CALLS-RESULT.md). Known limitation: desktop notifications can't be
delivered (messenger.com uses Web Push, which Electron cannot receive) — the dock badge + in-page
sound are the supported signal; see the Notifications section of
[`docs/HANDOFF.md`](docs/HANDOFF.md).

## What works today

- Loads `https://www.messenger.com` directly in a secured, sandboxed window.
- Persistent login (standard Chromium session storage — 2FA sessions survive restarts).
- Native macOS dock badge showing unread count (read from the page title).
- External links (anything outside Messenger/Facebook/fbcdn/fbsbx hosts) open in your default
  browser instead of navigating the app window.
- Downloads save to `~/Downloads`.
- Camera/mic/screen-share permissions are granted only for Messenger's own requests; every other
  permission request is denied by default.

## Getting started

Requires Node.js and [pnpm](https://pnpm.io).

```bash
pnpm install                          # install dependencies
pnpm start                            # build + launch the app locally
pnpm test                             # run the test suite (vitest)
CSC_NAME="Mercury Dev" pnpm run dist  # build a signed macOS .dmg (see below)
```

This project uses **pnpm** — `pnpm-lock.yaml` is the lockfile. Don't run `npm` or `yarn` here;
`npm install` regenerates a `package-lock.json` that conflicts with it (and CI installs with
`pnpm install --frozen-lockfile`).

## Building the macOS app

```bash
CSC_NAME="Mercury Dev" pnpm run dist
```

This produces a signed arm64 `.dmg` under `release/` (via `electron-builder`). **Signing with a
stable identity is required** — here a self-signed "Mercury Dev" certificate in the login
keychain (no Apple Developer ID needed). A plain `pnpm run dist` falls back to an ad-hoc
signature, which launches but cannot register for notifications and resets the TCC
(camera/mic/screen) permission grants on every rebuild — don't use it. See
[`docs/BUILD-NOTES.md`](docs/BUILD-NOTES.md) for exact `.app`/`.dmg` sizes and the RAM footprint
(filled in during a manual pass — not fabricated numbers).

### Faster builds while iterating: skip the .dmg

Most of `pnpm run dist`'s wall time is the single-threaded `.dmg` compression (plus a
timestamp-server round-trip per signed binary). When you just want the app itself:

```bash
pnpm run build && CSC_NAME="Mercury Dev" pnpm exec electron-builder --mac dir
```

This produces `release/mac-arm64/Messenger.app` directly — signed and launchable — which you can
copy straight to `/Applications`. Build the `.dmg` only when you want a distributable artifact.

## Architecture

The app is a thin shell: the window's URL is set to `messenger.com`, the browser process only
handles window/permission/link plumbing, and a sandboxed preload script reports the unread count
back to the app for the dock badge. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the process
model, runtime data/storage locations (profile dir, IndexedDB/cache, what's safe to delete), and
footprint; see [`AGENTS.md`](AGENTS.md) for the file-by-file source map and the security
invariants that must not be weakened.

## Further reading

- [`docs/HANDOFF.md`](docs/HANDOFF.md) — full history of why this rebuild happened (Tauri →
  Electron), what was researched and verified, and open questions.
- [`docs/superpowers/`](docs/superpowers) — the design spec and implementation plan this app was
  built from.
- [`docs/CALLS-RESULT.md`](docs/CALLS-RESULT.md) — the empirical calls-gate evidence (see Status
  above).
- [`docs/BUILD-NOTES.md`](docs/BUILD-NOTES.md) — real, measured build footprint.

## License

This project is licensed under the [MIT License](LICENSE).
