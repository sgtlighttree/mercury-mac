import * as fs from "fs";

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export const DEFAULT_BOUNDS: WindowBounds = { width: 1000, height: 800 };

/** Parse persisted window bounds; fall back to defaults on any malformed input. */
export function parseWindowBounds(raw: string): WindowBounds {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null) {
      const b = parsed as Record<string, unknown>;
      if (
        typeof b.width === "number" && b.width >= 400 &&
        typeof b.height === "number" && b.height >= 300 &&
        (b.x === undefined || typeof b.x === "number") &&
        (b.y === undefined || typeof b.y === "number")
      ) {
        return {
          ...(typeof b.x === "number" ? { x: Math.round(b.x) } : {}),
          ...(typeof b.y === "number" ? { y: Math.round(b.y) } : {}),
          width: Math.round(b.width),
          height: Math.round(b.height),
        };
      }
    }
  } catch {
    // malformed JSON -> defaults
  }
  return DEFAULT_BOUNDS;
}

export function loadWindowBounds(file: string): WindowBounds {
  try {
    return parseWindowBounds(fs.readFileSync(file, "utf8"));
  } catch {
    return DEFAULT_BOUNDS; // first run / unreadable -> defaults
  }
}

export function saveWindowBounds(file: string, bounds: WindowBounds): void {
  try {
    fs.writeFileSync(file, JSON.stringify(bounds));
  } catch {
    // best-effort: losing window geometry is not worth crashing over
  }
}
