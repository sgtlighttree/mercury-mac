# Build Notes (v0.1.0 MVP)

- Electron: 43.1.0  electron-builder: 25.1.8
- .app size: 282M   dmg size: 114M
- Signing: No valid "Developer ID Application" identity is present on this machine (all
  identities in the keychain are either untrusted or expired — see `electron-builder`
  output). electron-builder skipped code signing with a Developer ID and instead produced
  an ad-hoc signature (`codesign -dv` on `Messenger.app` reports `Signature=adhoc`,
  `flags=0x20002(adhoc,linker-signed)`). This is expected for an unsigned local build; no
  `CSC_IDENTITY_AUTO_DISCOVERY=false` override was actually needed — electron-builder fell
  back to ad-hoc signing on its own once it determined no valid identity was usable. On
  first launch, Gatekeeper will block the unsigned app; right-click → Open (or
  `xattr -d com.apple.quarantine /Applications/Messenger.app` after copying it there) is
  required once.
- RAM (running, logged in): PENDING — filled during manual pass
