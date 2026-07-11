# Build Notes (v0.1.0 MVP)

- Electron: 43.1.0  electron-builder: 25.1.8
- .app size: 282M   dmg size: 114M

## Signing — REQUIRED, not optional (updated 2026-07-11)

Build with the self-signed "Mercury Dev" identity (login keychain, trusted for code signing):

```bash
CSC_NAME="Mercury Dev" npm run dist
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

- RAM (running, logged in): PENDING — measure via Activity Monitor when convenient
