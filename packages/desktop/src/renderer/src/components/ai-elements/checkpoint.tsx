"use client";

import type { HugeIconProps } from "@hugeicons/react";
import type { ComponentProps, HTMLAttributes } from "react";

import { Bookmark01Icon, Search02Icon } from "@hugeicons/react";

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

export type CheckpointIconProps = HugeIconProps;

export const CheckpointIcon = ({ className, children, ...props }: CheckpointIconProps) =>
  children ?? (
    <Bookmark01Icon className={cn("size-4 shrink-0", className)} variant="solid" {...props} />
  );

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
              new CustomEvent("neovate:open-review", {
                detail: { category: "last-turn" },
              }),
            );
          }}
          {...props}
        />
      }
    >
      <Search02Icon className="size-3.5" variant="solid" />
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
