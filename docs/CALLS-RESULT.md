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

---

# Round 2–4 (2026-07-11, after fixes 3275a01 + c252dfc + cb602bd)

- **App commit:** cb602bd (dev via `npm start` AND packaged dmg both tested)

## Round-by-round root causes (three stacked issues, all fixed/explained)
1. `setWindowOpenHandler` denied the `about:blank` call popup → **fixed** (3275a01, c252dfc).
2. Web-layer permissions verified working (logs: `media` check + request both granted).
3. macOS TCC: dev runs launched from a terminal inherit the **launcher's** TCC identity
   (VS Code in this case — not Terminal, not "Electron"); packaged app is its own identity
   and prompts cleanly. Durable fix cb602bd: explicit `askForMediaAccess` on first media
   request when status is `not-determined`.

## Voice call (1:1)
- Mic permission prompt appeared: YES (macOS; VS Code needed the grant for dev runs)
- Call connected: YES — **made and received**, dev + packaged
- Two-way audio: YES

## Video call (1:1)
- Camera permission prompt appeared: YES
- Call connected: YES — made and received
- Two-way video: YES

## Screen share (in-call)
- Share worked: YES — but shares the **entire screen immediately**; no tab/window/screen
  picker like Chromium's (plan-mandated MVP choice: `setDisplayMediaRequestHandler` grants
  the primary screen; a source-picker UI is a logged follow-up).

## Gatekeeper note
- Neither the first nor updated dmg triggered Gatekeeper. Expected, not a bug: the
  quarantine xattr is only applied to files downloaded from the internet; locally built
  dmgs never carry it. The right-click→Open advice applies to *downloaded* copies.

## Verdict
- **GATE: PASSED (round 4)** — voice + video calls work bidirectionally in dev and packaged
  builds; screen share works (whole-screen only). The project's differentiator is real.
