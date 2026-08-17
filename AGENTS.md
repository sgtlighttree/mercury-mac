# AGENTS.md

Model-neutral guidance for working in this repo. Claude Code sessions read `CLAUDE.md`, which adds
Claude-specific tone and orchestration rules and otherwise defers here. `ARCHITECTURE.md` covers
the process model, storage layout, and footprint; `docs/HANDOFF.md` carries the research trail.

## What this is

A lightweight-for-Electron macOS desktop wrapper for Facebook Messenger. A thin native shell, not
a reimplementation: the window loads `https://www.messenger.com` directly; nearly all product
logic (chat, unread counts, calls) lives on the remote site. Main process (`src/main/`) is
plumbing (window, permissions, navigation guards, dock badge, calls); preload (`src/preload/`,
esbuild-bundled to one file because it runs under `sandbox: true`) is the only page→app bridge;
everything else is Meta's code running in the remote page.

Electron (Chromium), not Tauri/WebKit, for exactly one reason: Messenger's voice/video calls
depend on a Chrome-only WebRTC API (`createEncodedStreams`) that WebKit does not implement. See
`docs/HANDOFF.md` for the full research trail behind that decision.

**Calls-gate status: PASSED (2026-07-11).** Voice + video calls verified bidirectionally in dev
and packaged builds; screen share works (whole screen only). Evidence and root-cause trail in
`docs/CALLS-RESULT.md`. Anything touching popups, permissions, or navigation guards risks this —
the calls regression check in `docs/MANUAL-TESTS.md` §9 must be re-run after such changes.

## Commands

- `npm install` — classic npm. `package-lock.json` is the lockfile. CI installs with `npm ci`.
- `npm start` — `npm run build && electron .` — build + launch the app locally.
- `npm test` — vitest across 5 files in `tests/` covering the pure-logic modules (table below).
- `npm run build` — `tsc` (strict typecheck) + esbuild preload bundle into
  `dist/preload/index.js`. **This is the typecheck; there is no separate lint script.** CI runs
  exactly `npm ci && npm run build && npm test`.
- `CSC_NAME="Mercury Dev" npm run pack` — **the default packaged build.** Signed arm64
  `release/mac-arm64/Messenger.app`, **then installed straight into `/Applications`** by
  `scripts/install-app.cjs`. Owner's rule (2026-08-17): **build the `.app` only unless a `.dmg` is
  explicitly asked for.** The `.dmg` step is slow and single-threaded and buys nothing for a
  personal-use app.
  - No `sudo`: `/Applications` is `root:admin drwxrwxr-x` and the owner is in `admin`. The script
    refuses with instructions rather than escalating if that ever changes.
  - A running instance is **quit gracefully** (by bundle id, then SIGTERM to the exact PIDs of
    that bundle — never a name glob). Graceful matters: window geometry is written in the
    BrowserWindow `close` handler, so SIGKILL would lose it.
  - It **verifies the packed app's signature before touching `/Applications`** and refuses on
    failure, so a broken build can never replace a working install. The previous install is kept
    at `~/Quarantine/Messenger.app.previous` (one rotating rollback copy).
  - `MERCURY_NO_INSTALL=1 npm run pack` packs without installing — use it mid-call, or when you
    only want the artifact.
- `CSC_NAME="Mercury Dev" npm run dist` — same app **plus** the arm64 `.dmg`. Only when someone
  actually needs the installer (sharing a build, testing the Gatekeeper/quarantine path).
- **`CSC_NAME` is required either way**: ad-hoc signing can't register notifications and resets
  TCC (camera/mic/screen) grants every rebuild (see Packaging). Both paths run the `afterPack`
  hook, so fuses and `NSAllowsArbitraryLoads=false` are applied to the `.app` identically —
  `pack` is not a less-hardened build.

**Notifications are a known, evidence-backed limitation** — messenger.com posts them via Web Push,
which Electron cannot receive (no push service). Do NOT re-attempt page-Notification interception
without reading the "Notifications" section of `docs/HANDOFF.md` first; the existing preload shim
+ IPC bridge is the tested end state, and badge+sound was the chosen signal over synthetic banners.

## Architecture map

- **`src/main/config.ts`** — the single source of truth for the wrapped URL: `TARGET_URL`
  (`https://www.messenger.com`) and `ALLOWED_HOSTS` (hosts kept inside the app window:
  messenger.com, facebook.com, fbcdn.net, fbsbx.com — everything else is external). To point the
  app at a different URL, change `TARGET_URL` here — nowhere else. Also defines
  `POPUP_EXTERNAL_HOSTS` (currently facebook.com): hosts allowlisted for in-place navigation but
  never allowed to open as an in-app popup, because Facebook *content* links have no facebook.com
  session and would render a sign-in prompt
  (`docs/superpowers/specs/2026-07-27-facebook-link-handling-design.md`).
- **`src/main/links.ts`** — pure, unit-tested URL predicates (`isExternalUrl`, `isHttpUrl`,
  `isPopupExternalHost`) deciding whether a navigation/window-open stays in the app or is handed
  to `shell.openExternal`. No Electron imports. **The branch order inside `decideWindowOpen` is
  load-bearing for the calls gate** — the `about:blank` check must stay first, or call popups get
  externalized; three named regression tests guard it.
- **`src/main/index.ts`** — the app entrypoint: creates the `BrowserWindow` with the security
  webPreferences (see Security invariants), wires `setWindowOpenHandler` / `will-navigate` to
  `links.ts`'s predicates, configures the default session (downloads to `~/Downloads`, a
  permission handler granting only `media`/`display-capture`, a `setDisplayMediaRequestHandler`
  for screen share), restores/persists window bounds via `window-state.ts`, and listens for the
  preload's IPC messages — unread count sets the dock badge (`app.setBadgeCount`, with an
  anti-blink stabilizer), the ring signal raises the window for an incoming call.
- **`src/main/context-menu.ts`** — pure, unit-tested right-click menu template builder (spelling
  suggestions, Look Up, cut/copy/paste, link/image actions) with injected actions — no Electron
  imports; `attachContextMenu` in `index.ts` maps actions onto webContents/clipboard/shell.
- **`src/main/splash.ts`** — a small frameless, theme-aware (`prefers-color-scheme`) splash
  window built from an inline data-URL page (no static assets to package); shown while the main
  window loads messenger.com hidden, destroyed on reveal (`did-finish-load` / 15s cap).
- **`src/main/window-state.ts`** — pure, unit-tested parse/serialize helpers for persisted window
  bounds (`parseWindowBounds` falls back to `DEFAULT_BOUNDS` on malformed input); `index.ts`
  reads/writes them to `window-state.json` in userData so geometry survives restarts and is
  shared between dev run and packaged app.
- **`src/preload/`** — the sandboxed, esbuild-bundled preload. `unread.ts` is a pure function
  (`parseUnreadCount`) extracting the unread count from the page `<title>` (e.g. `"(3) Messenger"`
  → `3`); `incoming-call.ts` is a pure predicate (`isIncomingCallTitle`) matching ring-only title
  phrasings ("<name> is calling") while deliberately NOT matching post-call titles ("Call ended",
  "Missed video call"); `index.ts` wires both via a single `MutationObserver` on `<title>` and
  sends them to the main process over IPC — unread count drives the dock badge, the ring signal
  drives the incoming-call focus steal.
- **`src/shared/channels.ts`** — the single place IPC channel name constants (`IPC.SET_UNREAD`)
  are defined, shared between main and preload so the string literal exists once.
- **`src/shared/notification-inject.ts`** — MAIN-world page source (a template string, injected
  via `executeJavaScript` to bypass the site CSP) that overrides the page's `Notification`
  constructor and relays it → preload → IPC → native `Notification`. The bridge is in place and
  tested, but **no notification ever arrives** — messenger.com posts via Web Push, which Electron
  cannot receive. Read the Notifications caveat above before touching it.

## Security invariants — never weaken these

The page is remote, untrusted content (messenger.com), so the app is deliberately locked down:

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` on the `BrowserWindow`'s
  `webPreferences` (`src/main/index.ts`). The preload must stay a single bundled file with no
  Node/Electron internals leaking to the page — this is *why* it's esbuild-bundled rather than run
  as raw TypeScript.
- The session's permission handler (`ses.setPermissionRequestHandler`) grants only `media`
  (camera/mic) and `display-capture` (screen share); every other permission request must be
  denied. Don't broaden this without a specific reason.
- External/non-allowlisted navigations are intercepted (`setWindowOpenHandler`, `will-navigate`)
  and either handed to the system browser (http/https only) or dropped entirely (other schemes).
  Don't let arbitrary URLs load inside the app window.
- `build/entitlements.mac.plist` grants only camera, microphone, and JIT entitlements for the
  packaged app — no broader sandbox exceptions.

## Testing

`npm test` runs `vitest` across 5 test files:

| Test file | Covers |
|---|---|
| `tests/links.test.ts` | `src/main/links.ts` — `isExternalUrl` / `isHttpUrl` |
| `tests/unread.test.ts` | `src/preload/unread.ts` — `parseUnreadCount` |
| `tests/incoming-call.test.ts` | `src/preload/incoming-call.ts` — `isIncomingCallTitle` |
| `tests/window-state.test.ts` | `src/main/window-state.ts` — `parseWindowBounds` |
| `tests/context-menu.test.ts` | `src/main/context-menu.ts` — menu template builder |

**Pattern for new logic:** write it as a pure, Electron-import-free module (so it can be
unit-tested), and let `src/main/index.ts` (or `src/preload/index.ts`) do the Electron wiring.
Don't put `app`/`BrowserWindow`/`webContents` calls in the testable module. There is deliberately
no automated test for the wiring itself (window creation, IPC, permission handlers) — that's
exercised manually via `docs/MANUAL-TESTS.md`.

## Packaging

`npm run dist` uses `electron-builder` (config in `package.json`'s `"build"` block) to produce an
arm64-only, `en`-locale-only `.dmg` in `release/` — `directories.output` is `release`, *not*
`dist`, because `dist` is also the TypeScript/esbuild build-output directory; electron-builder's
`files` glob would otherwise recursively bundle its own previous output into the asar.

Builds are signed with the self-signed "Mercury Dev" certificate in the login Keychain — hence
`CSC_NAME="Mercury Dev"` on the `dist` command. Not an Apple Developer ID, not notarized, but a
stable signing identity means macOS treats each rebuild as the same app: TCC grants (camera,
microphone, notifications) persist across rebuilds instead of resetting, and launching an updated
build needs no Gatekeeper right-click → Open. Building without `CSC_NAME` falls back to ad-hoc
signing, which loses both properties. Real measured `.app`/`.dmg` sizes and RAM are recorded in
`docs/BUILD-NOTES.md` — don't invent footprint numbers.

## Runtime data gotchas

- `~/Library/Application Support/Messenger/` is the single Chromium profile shared by dev and
  packaged runs (`app.setName("Messenger")` in `src/main/index.ts`). Deleting it logs you out
  (session cookies) and clears the message cache (IndexedDB); it's recreated cleanly on next
  launch. Full layout in `ARCHITECTURE.md`.
- Dev runs (`npm start`) inherit the **launcher's** TCC identity, so mic/camera/screen behavior
  must be verified against the packaged build, not the dev run.

## Docs

- `CLAUDE.md` — Claude-specific tone + orchestration rules only; repo guidance deferred here.
- `ARCHITECTURE.md` — process model, runtime data/storage layout, footprint.
- `docs/HANDOFF.md` — research trail, decisions, and open questions (update it as you work).
- **Historical/dated docs are frozen.** `docs/CALLS-RESULT.md`, dated sections of
  `docs/HANDOFF.md`, and everything under `docs/superpowers/` and `.superpowers/sdd/` record the
  commands and repo name that actually ran at the time **on purpose** — rewriting them would
  falsify the evidence trail. Don't "fix" them; keep tooling/command updates to the live docs
  (`README.md`, `ARCHITECTURE.md`, `docs/BUILD-NOTES.md`, `docs/MANUAL-TESTS.md`, and the "Notes
  for Matt" section of `docs/HANDOFF.md`).
