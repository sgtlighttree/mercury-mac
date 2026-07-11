# Calls Gate — Empirical Results (M3 gate from the spec)

> Fill this in during the manual test pass. This file is the evidence the
> spec's M3 gate requires: do NOT claim calls work until verified here.

- **Date tested:** 2026-07-11
- **macOS version:** user's machine
- **Electron version:** 43.1.0
- **App commit:** e105e3a

## Voice call (1:1)
- Mic permission prompt appeared: NO
- Call connected: NO
- Two-way audio: NO
- Symptoms if failed: call buttons have no effect at all

## Video call (1:1)
- Camera permission prompt appeared: NO
- Call connected: NO
- Two-way video: NO
- Symptoms if failed: call buttons have no effect at all

## Incoming call pickup
- Answering an incoming call had any effect: NO
- Symptoms if failed: call buttons have no effect at all

## Screen share (in-call, best-effort)
- Share option present in Messenger's call UI: NOT REACHED (blocked by the above)
- macOS Screen Recording permission prompt: NOT REACHED (blocked by the above)
- Share worked: NOT REACHED (blocked by the above)
- Symptoms if failed: not reached — voice/video calls never connect, so the in-call share option is never surfaced

## Uploads (for reference)
- PDF upload: WORKS
- HTML upload: WORKS

## Verdict
- GATE: FAILED (round 1) — root cause diagnosed: about:blank call popup denied by setWindowOpenHandler; fix applied in this commit; RETEST PENDING (round 2)
