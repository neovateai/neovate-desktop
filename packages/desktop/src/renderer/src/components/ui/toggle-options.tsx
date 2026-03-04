"use client";

import { cn } from "../../lib/utils";

interface ToggleOptionProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{
    value: string;
    label: string;
  }>;
  disabled?: boolean;
}

export function ToggleOptions({ value, onChange, options, disabled }: ToggleOptionProps) {
  return (
    <div className="flex bg-muted rounded-lg p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors border cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed",
            value === option.value
              ? "bg-background text-foreground border-border"
              : "bg-transparent text-muted-foreground border-transparent hover:bg-accent",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
