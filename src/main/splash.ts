import { BrowserWindow } from "electron";

// Inlined as a data: URL so packaging needs no extra static file. Follows the
// OS light/dark mode via prefers-color-scheme (Matt's note: the splash must
// live OUTSIDE messenger.com and match the current theme).
const SPLASH_HTML = `<!doctype html>
<meta charset="utf-8">
<title>Messenger</title>
<style>
  html, body { height: 100%; margin: 0; }
  body {
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    gap: 14px; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    background: #ffffff; color: #1c2b33; user-select: none; cursor: default;
  }
  .logo {
    width: 56px; height: 56px; border-radius: 50%;
    background: linear-gradient(135deg, #0a7cff, #a10eeb 60%, #ff5297);
    animation: pulse 1.4s ease-in-out infinite;
  }
  .name { font-size: 14px; font-weight: 600; letter-spacing: 0.2px; }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(0.86); opacity: 0.7; }
  }
  @media (prefers-color-scheme: dark) {
    body { background: #1c1c1d; color: #e4e6eb; }
  }
</style>
<body><div class="logo"></div><div class="name">Messenger</div></body>`;

/** Small frameless theme-following window shown while messenger.com loads. */
export function createSplashWindow(backgroundColor: string): BrowserWindow {
  const splash = new BrowserWindow({
    width: 280,
    height: 240,
    frame: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor,
    webPreferences: { sandbox: true }, // our own static content; no preload, no Node
  });
  void splash.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(SPLASH_HTML));
  return splash;
}
