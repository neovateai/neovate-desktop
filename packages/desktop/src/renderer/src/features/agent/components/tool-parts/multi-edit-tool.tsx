import { MultiFileDiff } from "@pierre/diffs/react";
import { Files } from "lucide-react";
import { useTheme } from "next-themes";

import type { MultiEditUIToolInvocation } from "../../../../../../shared/claude-code/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";
import { OpenInEditorButton } from "./open-in-editor-button";

export function MultiEditTool({ invocation }: { invocation: MultiEditUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, errorText } = invocation;
  const { resolvedTheme } = useTheme();

  const filePath = input?.file_path;
  const editCount = input?.edits?.length ?? 0;
  const fileName = filePath?.split("/").pop() || "file";

  return (
    <Tool state={state} errorText={errorText}>
      <div className="flex items-center gap-1">
        <ToolHeader>
          <ToolHeaderIcon icon={Files} />
          MultiEdit {fileName} ({editCount} edits)
        </ToolHeader>
        {filePath && <OpenInEditorButton filePath={filePath} />}
      </div>
      <ToolContent className="space-y-3">
        {input?.edits?.map((edit, index) => (
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
        ))}
      </ToolContent>
    </Tool>
  );
}
