"use client";

import type { ComponentProps } from "react";

import { BookIcon, ChevronDownIcon } from "lucide-react";

import { cn } from "../../lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../ui/collapsible";

export type SourcesProps = ComponentProps<"div">;

export const Sources = ({ className, ...props }: SourcesProps) => (
  <Collapsible className={cn("not-prose mb-4 text-sm", className)} {...props} />
);

export type SourcesTriggerProps = ComponentProps<typeof CollapsibleTrigger> & {
  count: number;
};

export const SourcesTrigger = ({ className, count, children, ...props }: SourcesTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      "flex items-center gap-2 py-1.5 px-2 rounded-md transition-colors hover:bg-muted/50 cursor-pointer group",
      className,
    )}
    {...props}
  >
    {children ?? (
      <>
        <div className="relative flex items-center justify-center size-6 -ml-1 rounded-sm shrink-0">
          <BookIcon className="size-4 text-muted-foreground" />
        </div>
        <p className="font-medium text-muted-foreground">Used {count} sources</p>
        <div className="relative flex items-center justify-center size-4 ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronDownIcon className="size-3 text-muted-foreground transition-transform -rotate-90 group-data-[state=open]:rotate-0" />
        </div>
      </>
    )}
  </CollapsibleTrigger>
);

export type SourcesContentProps = ComponentProps<typeof CollapsibleContent>;

export const SourcesContent = ({ className, ...props }: SourcesContentProps) => (
  <CollapsibleContent
    className={cn(
      "pl-7 py-2 pr-3 flex w-fit flex-col gap-2",
      "data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:slide-in-from-top-2 outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
      className,
    )}
    {...props}
  />
);

export type SourceProps = ComponentProps<"a">;

export const Source = ({ href, title, children, ...props }: SourceProps) => (
  <a
    className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
    href={href}
    rel="noreferrer"
    target="_blank"
    {...props}
  >
    {children ?? (
      <>
        <BookIcon className="size-4" />
        <span className="block">{title}</span>
      </>
    )}
  </a>
);
