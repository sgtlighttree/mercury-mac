import { describe, expect, it } from "vitest";
import { notificationKey } from "../src/main/notifications";

describe("notificationKey", () => {
  it("namespaces ids by sender so a reloaded page's reset counter cannot collide", () => {
    expect(notificationKey(1, 5)).toBe("1:5");
    expect(notificationKey(1, 5)).not.toBe(notificationKey(2, 5));
  });
});
