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

## Status: calls are wired but UNVERIFIED

Camera/mic permissions, screen-share plumbing, and the entitlements needed for calls are all in
place (see Architecture below), but end-to-end voice/video/screen-share have **not yet been
confirmed working** in a real call. This is the project's calls gate — until
[`docs/CALLS-RESULT.md`](docs/CALLS-RESULT.md) is filled in with a PASSED verdict from an actual
test call, treat calls as unverified, not as a working feature.

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

Requires Node.js and npm.

```bash
npm install       # install dependencies
npm start         # build + launch the app locally
npm test          # run the test suite (vitest)
npm run dist      # build a distributable macOS .dmg (see below)
```

## Building the macOS app

```bash
npm run dist
```

This produces an arm64 `.dmg` under `release/` (via `electron-builder`). The build on this
machine is **unsigned** (no Apple Developer ID identity available) — electron-builder falls back
to an ad-hoc signature automatically. Because of this, macOS Gatekeeper will refuse to open the
app normally on first launch: **right-click the app → Open**, then confirm in the dialog. You only
need to do this once. See [`docs/BUILD-NOTES.md`](docs/BUILD-NOTES.md) for exact `.app`/`.dmg`
sizes and the RAM footprint (filled in during a manual pass — not fabricated numbers).

## Architecture

The app is a thin shell: the window's URL is set to `messenger.com`, the browser process only
handles window/permission/link plumbing, and a sandboxed preload script reports the unread count
back to the app for the dock badge. See [`CLAUDE.md`](CLAUDE.md) for the file-by-file map and the
security invariants that must not be weakened.

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
