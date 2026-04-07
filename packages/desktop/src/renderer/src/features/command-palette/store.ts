import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

type FrecencyEntry = { count: number; lastUsed: number };

const FRECENCY_KEY = "neovate-command-palette-frecency";

function loadFrecency(): Record<string, FrecencyEntry> {
  try {
    const raw = localStorage.getItem(FRECENCY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveFrecency(data: Record<string, FrecencyEntry>): void {
  try {
    localStorage.setItem(FRECENCY_KEY, JSON.stringify(data));
  } catch {
    // ignore quota errors
  }
}

type CommandPaletteState = {
  isOpen: boolean;
  frecency: Record<string, FrecencyEntry>;
  open: () => void;
  close: () => void;
  toggle: () => void;
  recordSelect: (id: string) => void;
  getFrecencyScore: (id: string) => number;
};

export const useCommandPaletteStore = create<CommandPaletteState>()(
  immer((set, get) => ({
    isOpen: false,
    frecency: loadFrecency(),

    open: () => set({ isOpen: true }),
    close: () => set({ isOpen: false }),
    toggle: () => set((s) => ({ isOpen: !s.isOpen })),

    recordSelect: (id) => {
      set((state) => {
        const entry = state.frecency[id] ?? { count: 0, lastUsed: 0 };
        entry.count += 1;
        entry.lastUsed = Date.now();
        state.frecency[id] = entry;
      });
      // Persist outside immer draft
      saveFrecency(get().frecency);
    },

    getFrecencyScore: (id) => {
      const entry = get().frecency[id];
      if (!entry) return 0;
      // Decay: halve the weight every 7 days
      const ageMs = Date.now() - entry.lastUsed;
      const decay = Math.pow(0.5, ageMs / (7 * 24 * 60 * 60 * 1000));
      return entry.count * decay;
    },
  })),
);
