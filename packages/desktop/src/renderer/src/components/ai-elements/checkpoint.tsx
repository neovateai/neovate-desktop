"use client";

import type { LucideProps } from "lucide-react";
import type { ComponentProps, HTMLAttributes } from "react";

import { BookmarkIcon, FileSearch } from "lucide-react";

import { cn } from "../../lib/utils";
import { Button } from "../ui/button";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export type CheckpointProps = HTMLAttributes<HTMLDivElement>;

export const Checkpoint = ({ className, children, ...props }: CheckpointProps) => (
  <div
    className={cn("flex items-center gap-0.5 overflow-hidden text-muted-foreground", className)}
    {...props}
  >
    {children}
    <Separator />
  </div>
);

export type CheckpointIconProps = LucideProps;

export const CheckpointIcon = ({ className, children, ...props }: CheckpointIconProps) =>
  children ?? <BookmarkIcon className={cn("size-4 shrink-0", className)} {...props} />;

export type CheckpointTriggerProps = ComponentProps<typeof Button> & {
  tooltip?: string;
};

export const CheckpointReviewTrigger = ({
  variant = "ghost",
  size = "sm",
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick" | "children">) => (
  <Tooltip>
    <TooltipTrigger
      render={
        <Button
          size={size}
          type="button"
          variant={variant}
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent("neovate:open-changes", {
                detail: { category: "last-turn" },
              }),
            );
          }}
          {...props}
        />
      }
    >
      <FileSearch className="size-3.5" />
    </TooltipTrigger>
    <TooltipContent align="start" side="bottom">
      Review changes
    </TooltipContent>
  </Tooltip>
);

export const CheckpointTrigger = ({
  children,
  variant = "ghost",
  size = "sm",
  tooltip,
  ...props
}: CheckpointTriggerProps) =>
  tooltip ? (
    <Tooltip>
      <TooltipTrigger render={<Button size={size} type="button" variant={variant} {...props} />}>
        {children}
      </TooltipTrigger>
      <TooltipContent align="start" side="bottom">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  ) : (
    <Button size={size} type="button" variant={variant} {...props}>
      {children}
    </Button>
  );
