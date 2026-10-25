import { BrowserWindow } from "electron";

// Inlined as a data: URL so packaging needs no extra static file. Follows the
// OS light/dark mode via prefers-color-scheme (Matt's note: the splash must
// live OUTSIDE messenger.com and match the current theme). The logo is the app icon
// (graphite tile, chrome mark) copied from build/icon-svg/ — regenerate both together.
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
    width: 64px; height: 64px; display: block;
    filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.25));
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
<body><svg class="logo" viewBox="0 0 1024 1024" aria-hidden="true"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2C2D34"/><stop offset="1" stop-color="#101013"/></linearGradient><linearGradient id="chrome" gradientUnits="userSpaceOnUse" x1="0" y1="180" x2="120" y2="870"><stop offset="0" stop-color="#FFFFFF"/><stop offset="0.35" stop-color="#D3D7E0"/><stop offset="0.55" stop-color="#7C8191"/><stop offset="0.75" stop-color="#B9BECB"/><stop offset="1" stop-color="#EEF0F5"/></linearGradient></defs>
<rect width="1024" height="1024" rx="230" fill="url(#bg)"/>
<path d="M328.7,768.1 A210,210 0 1 0 254.6,688.6 L232,830 Z" fill="none" stroke="url(#chrome)" stroke-width="72" stroke-linejoin="round"/>
<path d="M470,382 C610,350 760,280 870,180 C840,280 770,360 650,422 Z M642,460 C730,440 810,390 862,340 C832,418 770,470 670,508 Z M660,550 C730,538 790,508 828,480 C802,550 750,586 660,600 Z" fill="url(#chrome)"/></svg>
<div class="name">Messenger</div></body>`;

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
