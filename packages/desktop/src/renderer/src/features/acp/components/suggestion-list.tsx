import { forwardRef, useEffect, useImperativeHandle, useState } from "react";

export type SuggestionItem = {
  label: string;
  description?: string;
};

type Props = {
  items: SuggestionItem[];
  command: (item: SuggestionItem) => void;
};

export type SuggestionListHandle = {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean;
};

export const SuggestionList = forwardRef<SuggestionListHandle, Props>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === "ArrowUp") {
        setSelectedIndex((i) => (i + items.length - 1) % items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const item = items[selectedIndex];
        if (item) command(item);
        return true;
      }
      return false;
    },
  }));

  if (!items.length) return null;

  return (
    <div className="border bg-popover text-popover-foreground rounded-lg shadow-md overflow-hidden p-1">
      {items.map((item, index) => (
        <button
          key={item.label}
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left ${
            index === selectedIndex ? "bg-accent" : ""
          }`}
          onClick={() => command(item)}
          onMouseEnter={() => setSelectedIndex(index)}
          type="button"
        >
          <span className="font-medium">{item.label}</span>
          {item.description && <span className="text-muted-foreground">{item.description}</span>}
        </button>
      ))}
    </div>
  );
});

SuggestionList.displayName = "SuggestionList";
