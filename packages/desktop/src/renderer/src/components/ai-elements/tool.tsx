"use client";

import type { DynamicToolUIPart, ToolUIPart } from "ai";
import type { LucideProps } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { AlertCircle, ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { createContext, isValidElement, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { cn } from "../../lib/utils";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "../ui/collapsible";
import { CodeBlock } from "./code-block";

// --- Context ---

export type ToolPart = ToolUIPart | DynamicToolUIPart;

interface ToolContextValue {
  state: ToolPart["state"];
  errorText?: string;
}

const ToolContext = createContext<ToolContextValue | null>(null);

export const useToolContext = () => {
  const context = useContext(ToolContext);
  if (!context) {
    throw new Error("Tool components must be used within Tool");
  }
  return context;
};

// --- Tool (root) ---

export type ToolProps = ComponentProps<typeof Collapsible> & {
  state: ToolPart["state"];
  errorText?: string;
};

export const Tool = ({ state, errorText, className, children, ...props }: ToolProps) => {
  const contextValue = useMemo(() => ({ state, errorText }), [state, errorText]);
  return (
    <ToolContext.Provider value={contextValue}>
      <Collapsible
        className={cn("group/tool not-prose w-full overflow-hidden rounded-md", className)}
        {...props}
      >
        {children}
      </Collapsible>
    </ToolContext.Provider>
  );
};

// --- ToolHeader ---

export type ToolHeaderProps = {
  children: ReactNode;
  className?: string;
};

export const ToolHeader = ({ children, className }: ToolHeaderProps) => {
  const { state } = useToolContext();
  return (
    <CollapsibleTrigger
      className={cn(
        "inline-flex gap-2 w-max shrink-0 items-center text-sm cursor-pointer",
        state === "output-error" ? "text-destructive" : "text-foreground",
        className,
      )}
      style={{ width: "max-content" }}
    >
      {children}
    </CollapsibleTrigger>
  );
};

// --- ToolHeaderIcon ---

export type ToolHeaderIconProps = {
  icon: React.FC<LucideProps>;
};

export const ToolHeaderIcon = ({ icon: Icon }: ToolHeaderIconProps) => {
  const { state } = useToolContext();
  const iconColor = state === "output-error" ? "text-destructive" : "text-muted-foreground";
  return (
    <div className="relative flex size-3 shrink-0 items-center justify-center">
      <Icon
        className={cn(
          "absolute size-3 transition-opacity duration-150 group-hover/tool:opacity-0",
          iconColor,
        )}
      />
      <ChevronDown className="absolute size-3 -rotate-90 text-muted-foreground opacity-0 transition-all duration-150 group-hover/tool:opacity-100 group-data-[open]/tool:rotate-0" />
    </div>
  );
};

// --- ToolContent ---

export type ToolContentProps = ComponentProps<"div">;

export const ToolContent = ({ className, children }: ToolContentProps) => {
  const { t } = useTranslation();
  const { state, errorText } = useToolContext();
  return (
    <CollapsiblePanel
      keepMounted
      render={(_panelProps, panelState) => (
        <AnimatePresence initial={false}>
          {panelState.open && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{
                height: { duration: 0.2, ease: [0.4, 0, 0.2, 1] },
                opacity: { duration: 0.12 },
              }}
              className="mt-1 overflow-hidden"
            >
              <div
                className={cn(
                  "space-y-2 text-popover-foreground [--code-block-content-visibility:visible]",
                  className,
                )}
              >
                {state === "output-error" && (
                  <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="whitespace-pre-wrap">
                      {errorText || t("error.somethingWentWrong")}
                    </span>
                  </div>
                )}
                {children}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    />
  );
};

// --- ToolInput / ToolOutput (kept for backwards compatibility) ---

export type ToolInputProps = ComponentProps<"div"> & {
  input: ToolPart["input"];
};

export const ToolInput = ({ className, input, ...props }: ToolInputProps) => (
  <div className={cn("space-y-1.5", className)} {...props}>
    <span className="text-xs font-medium text-muted-foreground">Input</span>
    <div className="rounded-md bg-muted/30 overflow-hidden">
      <CodeBlock code={JSON.stringify(input, null, 2)} language="json" />
    </div>
  </div>
);

export type ToolOutputProps = ComponentProps<"div"> & {
  output: ToolPart["output"];
  errorText?: ToolPart["errorText"];
};

export const ToolOutput = ({ className, output, errorText, ...props }: ToolOutputProps) => {
  if (!(output || errorText)) {
    return null;
  }

  let Output = <div>{output as React.ReactNode}</div>;

  if (typeof output === "object" && !isValidElement(output)) {
    Output = <CodeBlock code={JSON.stringify(output, null, 2)} language="json" />;
  } else if (typeof output === "string") {
    Output = <CodeBlock code={output} language="json" />;
  }

  return (
    <div className={cn("space-y-1.5", className)} {...props}>
      <span className="text-xs font-medium text-muted-foreground">
        {errorText ? "Error" : "Output"}
      </span>
      <div
        className={cn(
          "rounded-md overflow-hidden",
          errorText ? "bg-destructive/10 text-destructive" : "bg-muted/30",
        )}
      >
        {errorText && <div className="p-3 text-sm">{errorText}</div>}
        {Output}
      </div>
    </div>
  );
};
