# Architecture

How the app is put together at runtime, and — because this is easy to lose track of with a
web wrapper — exactly where it puts its data on disk. For the file-by-file source map and the
security invariants, see [`AGENTS.md`](AGENTS.md); for build/signing facts, see
[`docs/BUILD-NOTES.md`](docs/BUILD-NOTES.md).

## Process model

Standard Electron three-layer split, kept deliberately thin because the page is remote,
untrusted content (messenger.com):

- **Main process** (`src/main/`) — window creation, the theme-aware splash, navigation/popup
  guards, downloads, permissions (camera/mic/screen only), dock badge + bounce, and the
  incoming-call focus steal. No product logic.
- **Preload** (`src/preload/`, esbuild-bundled to one file, runs under `sandbox: true`) — the
  only bridge between page and app. Watches `document.title` for two signals: the unread count
  (`"(3) Messenger"` → badge) and an incoming call ring (`"<name> is calling"` → focus steal).
  Also hosts the notification shim relay.
- **The page** — `https://www.messenger.com`, loaded directly. All chat/call/product behavior
  is Meta's code running in a sandboxed, context-isolated renderer with no Node access.

Voice/video call windows are `about:blank` popups the page opens and then navigates;
downloads are popups whose navigation *becomes* the download. Every allowed popup is created
hidden and revealed only when it commits a real navigation — that's why downloads never flash
a window (see `wireNavigationGuards`/`watchPopup` in `src/main/index.ts`).

## Where the app stores its data

Everything lives in one Chromium profile directory ("userData"):

```
~/Library/Application Support/Messenger/
```

The name comes from `app.setName("Messenger")` in `src/main/index.ts` — set explicitly so
`pnpm start` (dev) and the packaged app share ONE profile: login session, window geometry, and
caches persist across both. Observed layout (sizes from 2026-07-12, ~2 days of daily use,
~426MB total):

| Path | What it is | Observed size |
|---|---|---|
| `IndexedDB/` | Messenger's own message/conversation cache (the site stores chat data here) | 191M |
| `Cache/` | Chromium HTTP cache (images, media, JS from fbcdn) | 147M |
| `Code Cache/` | Compiled-JS bytecode cache for Messenger's scripts | 84M |
| `GPUCache/`, `Dawn*Cache/` | GPU shader caches | ~3M |
| `Cookies` | Session cookies — **this is the persistent login/2FA** (SQLite) | 20K |
| `Local Storage/`, `Session Storage/`, `WebStorage/` | The site's key-value storage | <1M |
| `Service Worker/` | messenger.com's registered service worker | 28K |
| `window-state.json` | **Ours** — persisted window bounds (`src/main/window-state.ts`) | 4K |
| everything else (`DIPS`, `Trust Tokens`, `Preferences`, …) | Chromium profile bookkeeping | <1M |

Practical consequences:

- **Deleting `~/Library/Application Support/Messenger/` fully resets the app** — logs you out
  (Cookies), drops the message cache (IndexedDB), and forgets window geometry. The app
  recreates it clean on next launch.
- The big three (IndexedDB / Cache / Code Cache) are all **regenerable caches** — safe to
  delete individually to reclaim disk; Messenger re-downloads what it needs.
- Downloads go to `~/Downloads` (main process forces the path; no save dialog).
- macOS permission (TCC) grants — mic/camera/screen — are keyed to the app's **code
  signature**, not to this directory; that's why builds must be signed with the stable
  "Mercury Dev" cert (`docs/BUILD-NOTES.md`).
- Dev runs (`pnpm start`) inherit the **launcher's** TCC identity (VS Code / Terminal), so
  mic/camera grants land on that app rather than on Messenger. The packaged app has its own
  identity — verify permission behavior against the packaged build, not the dev run. (This was
  one of the three stacked root causes behind the original calls failure; see
  `docs/CALLS-RESULT.md`.)
- `~/Library/Caches/electron/` (~116M) is **not the app** — it's the Electron zip cache the
  package manager uses on this dev machine. `~/Library/Caches/com.messenger.tauri/` (~7M) is a leftover from
  the abandoned Tauri prototype and can be deleted.

## Runtime footprint

~635MB RAM averaged across the Messenger processes (packaged app, logged in, measured
2026-07-12). The remote site dominates; the shell adds little — see the footprint discussion
in `docs/HANDOFF.md` and the measured build sizes in `docs/BUILD-NOTES.md`.

## App icon

The packaged app currently ships Electron's default icon. To brand it: put a **1024×1024 PNG
at `build/icon.png`** — electron-builder picks it up automatically and generates the `.icns`
(alternatively provide a ready-made `build/icon.icns`). The dev run (`pnpm start`) keeps the
default Electron dock icon unless `app.dock.setIcon(...)` is wired for non-packaged runs.
