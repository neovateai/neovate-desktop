import { MultiFileDiff } from "@pierre/diffs/react";
import { Files } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useMemo } from "react";

import type { MultiEditUIToolInvocation } from "../../../../../../shared/claude-code/types";

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

export function MultiEditTool({ invocation }: { invocation: MultiEditUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { input } = invocation;
  const { resolvedTheme } = useTheme();
  const app = useRendererApp();

  const filePath = input?.file_path;
  const fileName = filePath?.split("/").pop();
  const editCount = input?.edits?.length ?? 0;

  const handleFileClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (filePath) app.opener.open(filePath);
    },
    [app, filePath],
  );

  const { addedLines, removedLines } = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const edit of input?.edits ?? []) {
      removed += edit.old_string ? edit.old_string.split("\n").length : 0;
      added += edit.new_string ? edit.new_string.split("\n").length : 0;
    }
    return { addedLines: added, removedLines: removed };
  }, [input?.edits]);

  return (
    <Tool invocation={invocation}>
      <ToolHeader>
        <ToolHeaderIcon icon={Files} />
        <span className="shrink-0">MultiEdit</span>
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
          {editCount} edits{" "}
          <span className="text-green-600 dark:text-green-500">+{addedLines}</span>{" "}
          <span className="text-red-600 dark:text-red-500">-{removedLines}</span>
        </span>
      </ToolHeader>
      <ToolContent className="bg-transparent p-0 space-y-2">
        {input?.edits?.map((edit, index) => (
          <MultiFileDiff
            key={`${edit.old_string}-${index}`}
            oldFile={{ name: fileName || "file", contents: edit.old_string || "" }}
            newFile={{ name: fileName || "file", contents: edit.new_string || "" }}
            options={{
              theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
              diffStyle: "unified",
              disableFileHeader: true,
              disableLineNumbers: true,
            }}
          />
        ))}
      </ToolContent>
    </Tool>
  );
}
