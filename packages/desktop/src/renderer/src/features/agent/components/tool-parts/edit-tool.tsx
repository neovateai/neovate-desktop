import { MultiFileDiff } from "@pierre/diffs/react";
import { FileEdit } from "lucide-react";
import { useTheme } from "next-themes";

import type { EditUIToolInvocation } from "../../../../../../shared/claude-code/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";
import { OpenInEditorButton } from "./open-in-editor-button";

export function EditTool({ invocation }: { invocation: EditUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, errorText } = invocation;
  const { resolvedTheme } = useTheme();

  const filePath = input?.file_path;
  const fileName = filePath?.split("/").pop();

  const oldFile = {
    name: filePath?.split("/").pop() || "old",
    contents: input?.old_string || "",
  };
  const newFile = {
    name: filePath?.split("/").pop() || "new",
    contents: input?.new_string || "",
  };

  return (
    <Tool state={state} errorText={errorText}>
      <div className="flex items-center gap-1">
        <ToolHeader>
          <ToolHeaderIcon icon={FileEdit} />
          Edit {fileName}
        </ToolHeader>
        {filePath && <OpenInEditorButton filePath={filePath} />}
      </div>
      <ToolContent>
        <MultiFileDiff
          oldFile={oldFile}
          newFile={newFile}
          options={{
            theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
            diffStyle: "unified",
          }}
        />
      </ToolContent>
    </Tool>
  );
}
