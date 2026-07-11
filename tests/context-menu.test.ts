import { describe, it, expect, vi } from "vitest";
import {
  buildContextMenuTemplate,
  type ContextParams,
  type ContextMenuActions,
  type TemplateItem,
} from "../src/main/context-menu";

function makeParams(overrides: Partial<ContextParams> = {}): ContextParams {
  return {
    x: 10,
    y: 20,
    misspelledWord: "",
    dictionarySuggestions: [],
    isEditable: false,
    selectionText: "",
    linkURL: "",
    srcURL: "",
    mediaType: "none",
    editFlags: { canCut: false, canCopy: false, canPaste: false, canSelectAll: false },
    ...overrides,
  };
}

function makeActions(): ContextMenuActions {
  return {
    replaceMisspelling: vi.fn(),
    addToDictionary: vi.fn(),
    lookUpSelection: vi.fn(),
    copyLink: vi.fn(),
    openLinkExternal: vi.fn(),
    copyImage: vi.fn(),
    saveImage: vi.fn(),
  };
}

const labels = (t: TemplateItem[]) =>
  t.map((i) => ("label" in i ? i.label : "role" in i ? i.role : "|"));

describe("buildContextMenuTemplate", () => {
  it("returns an empty template for a plain right-click on nothing", () => {
    expect(buildContextMenuTemplate(makeParams(), makeActions())).toEqual([]);
  });

  it("puts spelling suggestions first and wires replaceMisspelling + addToDictionary", () => {
    const actions = makeActions();
    const t = buildContextMenuTemplate(
      makeParams({
        misspelledWord: "helo",
        dictionarySuggestions: ["hello", "help", "halo", "hero", "hell", "helot"],
        isEditable: true,
        editFlags: { canCut: true, canCopy: true, canPaste: true, canSelectAll: true },
      }),
      actions,
    );
    // capped at 5 suggestions, then Add to Dictionary
    expect(labels(t).slice(0, 6)).toEqual(["hello", "help", "halo", "hero", "hell", "Add to Dictionary"]);
    (t[0] as { click: () => void }).click();
    expect(actions.replaceMisspelling).toHaveBeenCalledWith("hello");
    (t[5] as { click: () => void }).click();
    expect(actions.addToDictionary).toHaveBeenCalledWith("helo");
  });

  it("shows a disabled 'No Guesses Found' when there are no suggestions", () => {
    const t = buildContextMenuTemplate(
      makeParams({ misspelledWord: "xzqv", isEditable: true }),
      makeActions(),
    );
    expect(t[0]).toMatchObject({ label: "No Guesses Found", enabled: false });
  });

  it("offers edit roles with enablement from editFlags in editable fields", () => {
    const t = buildContextMenuTemplate(
      makeParams({
        isEditable: true,
        editFlags: { canCut: false, canCopy: false, canPaste: true, canSelectAll: true },
      }),
      makeActions(),
    );
    expect(t).toEqual([
      { role: "cut", enabled: false },
      { role: "copy", enabled: false },
      { role: "paste", enabled: true },
      { role: "selectAll", enabled: true },
    ]);
  });

  it("offers Look Up (truncated) + Copy for a text selection outside an editable", () => {
    const actions = makeActions();
    const t = buildContextMenuTemplate(
      makeParams({
        selectionText: "the quick brown fox jumps over the lazy dog",
        editFlags: { canCut: false, canCopy: true, canPaste: false, canSelectAll: false },
      }),
      actions,
    );
    expect(labels(t)).toEqual(["Look Up “the quick brown fox jumps…”", "|", "copy"]);
    (t[0] as { click: () => void }).click();
    expect(actions.lookUpSelection).toHaveBeenCalled();
  });

  it("offers open-in-browser + copy for http links, wired to the right URL", () => {
    const actions = makeActions();
    const t = buildContextMenuTemplate(
      makeParams({ linkURL: "https://example.com/x" }),
      actions,
    );
    expect(labels(t)).toEqual(["Open Link in Browser", "Copy Link Address"]);
    (t[0] as { click: () => void }).click();
    expect(actions.openLinkExternal).toHaveBeenCalledWith("https://example.com/x");
    (t[1] as { click: () => void }).click();
    expect(actions.copyLink).toHaveBeenCalledWith("https://example.com/x");
  });

  it("never offers to open a non-http link (copy only)", () => {
    const t = buildContextMenuTemplate(
      makeParams({ linkURL: "javascript:void(0)" }),
      makeActions(),
    );
    expect(labels(t)).toEqual(["Copy Link Address"]);
  });

  it("offers copy/save for images at the click coordinates", () => {
    const actions = makeActions();
    const t = buildContextMenuTemplate(
      makeParams({ mediaType: "image", srcURL: "https://scontent.fbcdn.net/p.jpg", x: 3, y: 7 }),
      actions,
    );
    expect(labels(t)).toEqual(["Copy Image", "Save Image to Downloads"]);
    (t[0] as { click: () => void }).click();
    expect(actions.copyImage).toHaveBeenCalledWith(3, 7);
    (t[1] as { click: () => void }).click();
    expect(actions.saveImage).toHaveBeenCalledWith("https://scontent.fbcdn.net/p.jpg");
  });

  it("separates sections with exactly one separator and never dangles one", () => {
    const t = buildContextMenuTemplate(
      makeParams({
        selectionText: "hi",
        linkURL: "https://example.com",
        editFlags: { canCut: false, canCopy: true, canPaste: false, canSelectAll: false },
      }),
      makeActions(),
    );
    const l = labels(t);
    expect(l[0]).not.toBe("|");
    expect(l[l.length - 1]).not.toBe("|");
    expect(l.join(",")).not.toContain("|,|");
  });
});
