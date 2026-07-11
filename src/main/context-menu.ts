import { isHttpUrl } from "./links";

// Electron shows NO context menu by default: no right-click copy/paste, and the
// spellchecker's red squiggles offer no corrections. This module builds the menu
// template as plain data — no Electron imports — so the logic is unit-testable
// (tests/context-menu.test.ts); index.ts turns it into a real Menu.

/** The subset of Electron.ContextMenuParams this builder reads (structurally
 *  compatible: an Electron params object can be passed straight in). */
export interface ContextParams {
  x: number;
  y: number;
  misspelledWord: string;
  dictionarySuggestions: string[];
  isEditable: boolean;
  selectionText: string;
  linkURL: string;
  srcURL: string;
  mediaType: string;
  editFlags: {
    canCut: boolean;
    canCopy: boolean;
    canPaste: boolean;
    canSelectAll: boolean;
  };
}

/** What the menu items do — injected so tests can pass stubs and the builder
 *  never touches Electron. index.ts maps these onto webContents/clipboard/shell. */
export interface ContextMenuActions {
  replaceMisspelling(word: string): void;
  addToDictionary(word: string): void;
  lookUpSelection(): void;
  copyLink(url: string): void;
  openLinkExternal(url: string): void;
  copyImage(x: number, y: number): void;
  saveImage(url: string): void;
}

/** Structurally a subset of Electron.MenuItemConstructorOptions. */
export type TemplateItem =
  | { type: "separator" }
  | { role: "cut" | "copy" | "paste" | "selectAll"; enabled?: boolean }
  | { label: string; enabled?: boolean; click?: () => void };

const MAX_SUGGESTIONS = 5;
const LOOKUP_PREVIEW_CHARS = 25;

/** Build the right-click menu for the given context; [] means "show nothing". */
export function buildContextMenuTemplate(
  params: ContextParams,
  actions: ContextMenuActions,
): TemplateItem[] {
  const sections: TemplateItem[][] = [];

  // Spelling — suggestions first, like every macOS text field.
  if (params.misspelledWord) {
    const suggestions: TemplateItem[] = params.dictionarySuggestions
      .slice(0, MAX_SUGGESTIONS)
      .map((word) => ({ label: word, click: () => actions.replaceMisspelling(word) }));
    if (suggestions.length === 0) suggestions.push({ label: "No Guesses Found", enabled: false });
    const word = params.misspelledWord;
    suggestions.push({ label: "Add to Dictionary", click: () => actions.addToDictionary(word) });
    sections.push(suggestions);
  }

  // Look Up (macOS dictionary/definition popover) for any selected text.
  const selection = params.selectionText.trim();
  if (selection) {
    const preview =
      selection.length > LOOKUP_PREVIEW_CHARS
        ? selection.slice(0, LOOKUP_PREVIEW_CHARS) + "…"
        : selection;
    sections.push([{ label: `Look Up “${preview}”`, click: () => actions.lookUpSelection() }]);
  }

  // Edit operations. In non-editable content only Copy makes sense.
  if (params.isEditable) {
    sections.push([
      { role: "cut", enabled: params.editFlags.canCut },
      { role: "copy", enabled: params.editFlags.canCopy },
      { role: "paste", enabled: params.editFlags.canPaste },
      { role: "selectAll", enabled: params.editFlags.canSelectAll },
    ]);
  } else if (selection) {
    sections.push([{ role: "copy", enabled: params.editFlags.canCopy }]);
  }

  // Links. Opening always goes through the system browser — never the app
  // window — and only for http(s), mirroring the navigation guards.
  if (params.linkURL) {
    const url = params.linkURL;
    const linkItems: TemplateItem[] = [];
    if (isHttpUrl(url)) {
      linkItems.push({ label: "Open Link in Browser", click: () => actions.openLinkExternal(url) });
    }
    linkItems.push({ label: "Copy Link Address", click: () => actions.copyLink(url) });
    sections.push(linkItems);
  }

  // Images (photos/stickers in chat).
  if (params.mediaType === "image" && params.srcURL) {
    const { x, y } = params;
    const src = params.srcURL;
    sections.push([
      { label: "Copy Image", click: () => actions.copyImage(x, y) },
      { label: "Save Image to Downloads", click: () => actions.saveImage(src) },
    ]);
  }

  // Join non-empty sections with separators.
  return sections.reduce<TemplateItem[]>(
    (menu, section) =>
      menu.length === 0 ? [...section] : [...menu, { type: "separator" }, ...section],
    [],
  );
}
