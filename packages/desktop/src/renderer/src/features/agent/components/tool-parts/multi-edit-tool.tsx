import { MultiFileDiff } from "@pierre/diffs/react";
import { AlertCircle } from "lucide-react";
import { useTheme } from "next-themes";

import type { MultiEditUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function MultiEditTool({ invocation }: { invocation: MultiEditUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, errorText } = invocation;
  const { resolvedTheme } = useTheme();

  const editCount = input?.edits?.length ?? 0;
  const title = input?.file_path ? `MultiEdit ${input.file_path} (${editCount} edits)` : undefined;
  const hasError = state === "output-error";
  const fileName = input?.file_path?.split("/").pop() || "file";

  return (
    <Tool>
      <ToolHeader type="tool-MultiEdit" state={state} title={title} />
      <ToolContent className="space-y-3">
        {hasError && errorText ? (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{errorText}</span>
          </div>
        ) : (
          input?.edits?.map((edit, index) => (
            <div key={`${edit.old_string}-${index}`} className="space-y-1">
              <h4 className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                Edit {index + 1}
              </h4>
              <MultiFileDiff
                oldFile={{ name: fileName, contents: edit.old_string || "" }}
                newFile={{ name: fileName, contents: edit.new_string || "" }}
                options={{
                  theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
                  diffStyle: "unified",
                }}
              />
            </div>
          ))
        )}
      </ToolContent>
    </Tool>
  );
}
