import { describe, it, expect } from "vitest";
import { isIncomingCallTitle } from "../src/preload/incoming-call";

describe("isIncomingCallTitle", () => {
  it("matches the observed ring title '<first name> is calling'", () => {
    expect(isIncomingCallTitle("Hugh is calling")).toBe(true);
  });
  it("matches a full-name / 'calling you' variant", () => {
    expect(isIncomingCallTitle("Hugh Milner is calling you")).toBe(true);
  });
  it("matches 'Incoming call' variants defensively", () => {
    expect(isIncomingCallTitle("Incoming call")).toBe(true);
    expect(isIncomingCallTitle("Incoming video call")).toBe(true);
    expect(isIncomingCallTitle("Incoming audio call")).toBe(true);
  });
  it("matches the cross-checked wrapper-ecosystem variants", () => {
    expect(isIncomingCallTitle("Video call from Hugh Milner")).toBe(true);
    expect(isIncomingCallTitle("Audio call from Hugh")).toBe(true);
    expect(isIncomingCallTitle("Hugh wants to call")).toBe(true);
    expect(isIncomingCallTitle("Hugh wants to video call")).toBe(true);
  });
  it("rejects the normal idle and unread titles", () => {
    expect(isIncomingCallTitle("Messenger")).toBe(false);
    expect(isIncomingCallTitle("(3) Messenger")).toBe(false);
  });
  it("rejects unrelated call-adjacent titles (missed/ended/ongoing calls)", () => {
    expect(isIncomingCallTitle("Missed video call")).toBe(false);
    expect(isIncomingCallTitle("Call ended")).toBe(false);
    expect(isIncomingCallTitle("Ongoing call")).toBe(false);
    expect(isIncomingCallTitle("You started a call")).toBe(false);
  });
});
