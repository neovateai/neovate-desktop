import { MultiFileDiff } from "@pierre/diffs/react";
import { FileEdit } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useMemo } from "react";

import type { EditUIToolInvocation } from "../../../../../../shared/claude-code/types";

import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";
import { Badge } from "../../../../components/ui/badge";
import {
  Tooltip,
  TooltipPopup,
  TooltipProvider,
  TooltipTrigger,
} from "../../../../components/ui/tooltip";
import { useRendererApp } from "../../../../core/app";

export function EditTool({ invocation }: { invocation: EditUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, errorText } = invocation;
  const { resolvedTheme } = useTheme();
  const app = useRendererApp();

  const filePath = input?.file_path;
  const fileName = filePath?.split("/").pop();

  const handleFileClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (filePath) app.opener.open(filePath);
    },
    [app, filePath],
  );

  const oldString = input?.old_string || "";
  const newString = input?.new_string || "";

  const removedLines = useMemo(() => (oldString ? oldString.split("\n").length : 0), [oldString]);
  const addedLines = useMemo(() => (newString ? newString.split("\n").length : 0), [newString]);

  const oldFile = useMemo(
    () => ({ name: fileName || "old", contents: oldString }),
    [fileName, oldString],
  );
  const newFile = useMemo(
    () => ({ name: fileName || "new", contents: newString }),
    [fileName, newString],
  );

  return (
    <Tool state={state} errorText={errorText}>
      <ToolHeader>
        <ToolHeaderIcon icon={FileEdit} />
        <span className="shrink-0">Edit</span>
        {fileName && (
          <TooltipProvider delay={0}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Badge variant="outline" className="cursor-pointer" onClick={handleFileClick}>
                    {fileName}
                  </Badge>
                }
              />
              <TooltipPopup>{filePath}</TooltipPopup>
            </Tooltip>
          </TooltipProvider>
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          <span className="text-green-600 dark:text-green-500">+{addedLines}</span>{" "}
          <span className="text-red-600 dark:text-red-500">-{removedLines}</span>
        </span>
      </ToolHeader>
      <ToolContent className="bg-transparent p-0">
        <MultiFileDiff
          oldFile={oldFile}
          newFile={newFile}
          options={{
            theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
            diffStyle: "unified",
            disableFileHeader: true,
            disableLineNumbers: true,
          }}
        />
      </ToolContent>
    </Tool>
  );
}
