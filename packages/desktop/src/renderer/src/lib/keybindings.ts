/**
 * Keybinding utilities for capture, matching, and display formatting.
 */

// Symbol mapping for display
const SYMBOL_MAP: Record<string, string> = {
  Cmd: "⌘",
  Ctrl: "⌃",
  Option: "⌥",
  Shift: "⇧",
  Esc: "⎋",
  Space: "␣",
  Enter: "↵",
  Backspace: "⌫",
  Delete: "⌦",
  Tab: "⇥",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

/**
 * Capture a keybinding from a KeyboardEvent.
 * Returns null if only modifier keys are pressed.
 */
export function captureKeybinding(e: KeyboardEvent): string | null {
  // Ignore modifier-only presses
  if (["Meta", "Control", "Alt", "Shift"].includes(e.key)) {
    return null;
  }

  const parts: string[] = [];
  if (e.metaKey) parts.push("Cmd");
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Option");
  if (e.shiftKey) parts.push("Shift");

  // Normalize key name
  let key: string;
  if (e.key === " ") {
    key = "Space";
  } else if (e.key === "Escape") {
    key = "Esc";
  } else if (e.key.length === 1) {
    key = e.key.toUpperCase();
  } else {
    key = e.key;
  }

  parts.push(key);
  return parts.join("+");
}

/**
 * Format a binding string for display as an array of symbols/keys.
 * "Cmd+Option+T" → ["⌘", "⌥", "T"]
 */
export function formatKeyForDisplay(binding: string): string[] {
  return binding.split("+").map((k) => SYMBOL_MAP[k] || k);
}

/**
 * Check if a KeyboardEvent matches a binding string.
 * Supports cross-platform: Cmd matches metaKey on Mac, ctrlKey on Windows/Linux.
 */
export function matchesBinding(e: KeyboardEvent, binding: string): boolean {
  const parts = binding.split("+");

  const wantCmd = parts.includes("Cmd");
  const wantCtrl = parts.includes("Ctrl");
  const wantOption = parts.includes("Option");
  const wantShift = parts.includes("Shift");
  const key = parts.find((p) => !["Cmd", "Ctrl", "Option", "Shift"].includes(p));

  if (!key) return false;

  // Normalize the event key for comparison
  let eventKey: string;
  if (e.key === "Escape") {
    eventKey = "Esc";
  } else if (e.key === " ") {
    eventKey = "Space";
  } else if (e.key.length === 1) {
    eventKey = e.key.toUpperCase();
  } else {
    eventKey = e.key;
  }

  // Cross-platform: Cmd matches metaKey OR ctrlKey (for Windows/Linux)
  const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.platform);
  const cmdMatches = wantCmd
    ? isMac
      ? e.metaKey
      : e.metaKey || e.ctrlKey
    : !e.metaKey && (isMac || !e.ctrlKey);

  const ctrlMatches = wantCtrl ? e.ctrlKey : isMac || !e.ctrlKey || wantCmd;
  const optionMatches = wantOption ? e.altKey : !e.altKey;
  const shiftMatches = wantShift ? e.shiftKey : !e.shiftKey;

  return cmdMatches && ctrlMatches && optionMatches && shiftMatches && eventKey === key;
}

/**
 * Keybinding action identifiers
 */
export type KeybindingAction =
  | "openSettings"
  | "newChat"
  | "closeSettings"
  | "toggleTheme"
  | "clearTerminal"
  | "prevSession"
  | "nextSession"
  | "copyPath";

/**
 * Actions that are read-only (not customizable by user)
 * These are handled specially and should not be editable in settings
 */
export const READONLY_ACTIONS: KeybindingAction[] = [
  "openSettings",
  "toggleTheme",
  "clearTerminal",
];

/**
 * Translation keys for keybinding actions
 */
export const KEYBINDING_LABEL_KEYS: Record<KeybindingAction, string> = {
  openSettings: "settings.keybindings.openSettings",
  newChat: "settings.keybindings.newChat",
  closeSettings: "settings.keybindings.closeSettings",
  toggleTheme: "settings.keybindings.toggleTheme",
  clearTerminal: "settings.keybindings.clearTerminal",
  prevSession: "settings.keybindings.prevSession",
  nextSession: "settings.keybindings.nextSession",
  copyPath: "settings.keybindings.copyPath",
};

/**
 * Human-readable labels for keybinding actions (for backward compatibility)
 */
export const KEYBINDING_LABELS: Record<KeybindingAction, string> = {
  openSettings: "Open Settings",
  newChat: "New Chat",
  closeSettings: "Close Settings",
  toggleTheme: "Toggle Theme",
  clearTerminal: "Clear Terminal",
  prevSession: "Previous Session",
  nextSession: "Next Session",
  copyPath: "Copy Path",
};

/**
 * Default keybindings
 */
export const DEFAULT_KEYBINDINGS: Record<KeybindingAction, string> = {
  openSettings: "Cmd+,",
  newChat: "Cmd+N",
  closeSettings: "Cmd+Esc",
  toggleTheme: "Cmd+Option+T",
  clearTerminal: "Cmd+K",
  prevSession: "Cmd+Option+ArrowUp",
  nextSession: "Cmd+Option+ArrowDown",
  copyPath: "Cmd+Shift+C",
};
