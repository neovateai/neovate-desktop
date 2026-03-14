import { MultiFileDiff } from "@pierre/diffs/react";
import { AlertCircle } from "lucide-react";
import { useTheme } from "next-themes";

import type { EditUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

export function EditTool({ invocation }: { invocation: EditUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, errorText } = invocation;
  const { resolvedTheme } = useTheme();

  const title = input?.file_path ? `Edit  ${input.file_path}` : undefined;
  const hasError = state === "output-error";

  const oldFile = {
    name: input?.file_path?.split("/").pop() || "old",
    contents: input?.old_string || "",
  };
  const newFile = {
    name: input?.file_path?.split("/").pop() || "new",
    contents: input?.new_string || "",
  };

  return (
    <Tool>
      <ToolHeader type="tool-Edit" state={state} title={title} />
      <ToolContent>
        {hasError && errorText ? (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{errorText}</span>
          </div>
        ) : (
          <MultiFileDiff
            oldFile={oldFile}
            newFile={newFile}
            options={{
              theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
              diffStyle: "unified",
            }}
          />
        )}
      </ToolContent>
    </Tool>
  );
}
