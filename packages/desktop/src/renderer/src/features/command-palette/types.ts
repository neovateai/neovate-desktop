import type { ComponentType } from "react";

export type CommandItem = {
  id: string;
  label: string;
  group: "session" | "command";
  category?: string;
  icon?: ComponentType<{ className?: string }>;
  shortcut?: string[];
  keywords?: string[];
  /** Only show this item when predicate returns true */
  when?: () => boolean;
  /** Show current state inline, e.g. "(dark)" for theme toggle */
  stateLabel?: () => string;
  /** Preview subtitle for sessions, e.g. first user message */
  preview?: string;
  /** Right-aligned metadata, e.g. "2h ago · project-name" */
  metadata?: string;
  onSelect: () => void;
};
