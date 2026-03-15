import { ChevronRight, Folder } from "lucide-react";
import {
  createElement,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { cn } from "../../../lib/utils";

export type SuggestionItem = {
  id?: string;
  label: string;
  title?: string;
  description?: string;
  isDirectory?: boolean;
};

type Props = {
  items: SuggestionItem[];
  command: (item: SuggestionItem) => void;
  header?: string;
  icon?: ReactNode;
};

export type SuggestionListHandle = {
  onKeyDown: (event: { event: KeyboardEvent }) => boolean;
};

export const SuggestionList = forwardRef<SuggestionListHandle, Props>(
  ({ items, command, header, icon }, ref) => {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const selectedRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
      setSelectedIndex(0);
    }, [items]);

    useEffect(() => {
      selectedRef.current?.scrollIntoView({ block: "nearest" });
    }, [selectedIndex]);

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
      <div className="border border-b-0 bg-popover text-popover-foreground rounded-t-lg shadow-md overflow-hidden max-h-[300px] flex flex-col">
        {header && (
          <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground border-b border-border/50 shrink-0">
            {header}
          </div>
        )}
        <div className="p-1 overflow-y-auto">
          {items.map((item, index) => (
            <button
              key={item.id ?? item.label}
              ref={index === selectedIndex ? selectedRef : undefined}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-left",
                index === selectedIndex && "bg-accent",
              )}
              onClick={() => command(item)}
              onMouseEnter={() => setSelectedIndex(index)}
              type="button"
            >
              {(icon || item.isDirectory) && (
                <span className="shrink-0 text-muted-foreground">
                  {item.isDirectory ? createElement(Folder, { className: "h-4 w-4" }) : icon}
                </span>
              )}
              <span className="shrink-0">{item.title ?? item.label}</span>
              {item.description && (
                <span className="min-w-0 truncate text-muted-foreground text-xs">
                  {item.description}
                </span>
              )}
              {item.isDirectory && (
                <>
                  <span className="flex-1" />
                  {createElement(ChevronRight, {
                    className: "h-3.5 w-3.5 shrink-0 text-muted-foreground",
                  })}
                </>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  },
);

SuggestionList.displayName = "SuggestionList";
