"use client";

import type { Tool } from "ai";
import type { ComponentProps } from "react";

import { BotIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "../../lib/utils";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";
import { Badge } from "../ui/badge";
import { CodeBlock } from "./code-block";

export type AgentProps = ComponentProps<"div">;

export const Agent = memo(({ className, ...props }: AgentProps) => (
  <div className={cn("not-prose w-full rounded-md", className)} {...props} />
));

export type AgentHeaderProps = ComponentProps<"div"> & {
  name: string;
  model?: string;
};

export const AgentHeader = memo(({ className, name, model, ...props }: AgentHeaderProps) => (
  <div
    className={cn("flex w-full items-center justify-between gap-4 py-1.5 px-2", className)}
    {...props}
  >
    <div className="flex items-center gap-2">
      <div className="relative flex items-center justify-center size-6 -ml-1 rounded-sm shrink-0">
        <BotIcon className="size-4 text-muted-foreground" />
      </div>
      <span className="font-medium text-sm">{name}</span>
      {model && (
        <Badge className="font-mono text-xs" variant="secondary">
          {model}
        </Badge>
      )}
    </div>
  </div>
));

export type AgentContentProps = ComponentProps<"div">;

export const AgentContent = memo(({ className, ...props }: AgentContentProps) => (
  <div className={cn("space-y-4 pl-7 pr-3 py-2", className)} {...props} />
));

export type AgentInstructionsProps = ComponentProps<"div"> & {
  children: string;
};

export const AgentInstructions = memo(
  ({ className, children, ...props }: AgentInstructionsProps) => (
    <div className={cn("space-y-2", className)} {...props}>
      <span className="font-medium text-muted-foreground text-sm">Instructions</span>
      <div className="rounded-md bg-muted/50 p-3 text-muted-foreground text-sm">
        <p>{children}</p>
      </div>
    </div>
  ),
);

export type AgentToolsProps = ComponentProps<typeof Accordion>;

export const AgentTools = memo(({ className, ...props }: AgentToolsProps) => (
  <div className={cn("space-y-2", className)}>
    <span className="font-medium text-muted-foreground text-sm">Tools</span>
    <Accordion className="rounded-md" {...props} />
  </div>
));

export type AgentToolProps = ComponentProps<typeof AccordionItem> & {
  tool: Tool;
};

export const AgentTool = memo(({ className, tool, value, ...props }: AgentToolProps) => {
  const schema = "jsonSchema" in tool && tool.jsonSchema ? tool.jsonSchema : tool.inputSchema;

  return (
    <AccordionItem className={cn("border-none", className)} value={value} {...props}>
      <AccordionTrigger className="px-3 py-2 text-sm hover:no-underline hover:bg-muted/50 rounded-md">
        {tool.description ?? "No description"}
      </AccordionTrigger>
      <AccordionContent className="pl-7 pr-3 pb-3">
        <div className="rounded-md bg-muted/30">
          <CodeBlock code={JSON.stringify(schema, null, 2)} language="json" />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
});

export type AgentOutputProps = ComponentProps<"div"> & {
  schema: string;
};

export const AgentOutput = memo(({ className, schema, ...props }: AgentOutputProps) => (
  <div className={cn("space-y-2", className)} {...props}>
    <span className="font-medium text-muted-foreground text-sm">Output Schema</span>
    <div className="rounded-md bg-muted/50">
      <CodeBlock code={schema} language="typescript" />
    </div>
  </div>
));

Agent.displayName = "Agent";
AgentHeader.displayName = "AgentHeader";
AgentContent.displayName = "AgentContent";
AgentInstructions.displayName = "AgentInstructions";
AgentTools.displayName = "AgentTools";
AgentTool.displayName = "AgentTool";
AgentOutput.displayName = "AgentOutput";
