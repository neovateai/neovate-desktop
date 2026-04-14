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
  const input = invocation?.state !== "input-streaming" ? invocation?.input : undefined;
  const output = invocation?.state === "output-available" ? invocation.output : undefined;
  const { resolvedTheme } = useTheme();
  const app = useRendererApp();

  const filePath = output?.filePath ?? input?.file_path;
  const fileName = filePath?.split("/").pop();

  const handleFileClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (filePath) app.opener.open(filePath);
    },
    [app, filePath],
  );

  const diffStats = useMemo(() => {
    if (output?.structuredPatch) {
      let additions = 0;
      let deletions = 0;
      for (const hunk of output.structuredPatch) {
        for (const line of hunk.lines) {
          if (line.startsWith("+")) additions++;
          else if (line.startsWith("-")) deletions++;
        }
      }
      return { additions, deletions };
    }
    return null;
  }, [output?.structuredPatch]);

  const oldString = output?.oldString ?? input?.old_string ?? "";
  const newString = output?.newString ?? input?.new_string ?? "";

  const oldFile = useMemo(
    () => ({ name: fileName || "old", contents: oldString }),
    [fileName, oldString],
  );
  const newFile = useMemo(
    () => ({ name: fileName || "new", contents: newString }),
    [fileName, newString],
  );

  if (!invocation || invocation.state === "input-streaming") return null;

  const { state, errorText } = invocation;

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
        {diffStats && (
          <span className="shrink-0 text-xs text-muted-foreground">
            <span className="text-green-600 dark:text-green-500">+{diffStats.additions}</span>{" "}
            <span className="text-red-600 dark:text-red-500">-{diffStats.deletions}</span>
          </span>
        )}
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
