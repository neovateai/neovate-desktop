import { File as PierreFile } from "@pierre/diffs/react";
import { FilePlus } from "lucide-react";
import { useTheme } from "next-themes";
import { useCallback, useMemo } from "react";

import type { WriteUIToolInvocation } from "../../../../../../shared/claude-code/types";

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

export function WriteTool({ invocation }: { invocation: WriteUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { input } = invocation;
  const { resolvedTheme } = useTheme();
  const app = useRendererApp();

  const filePath = input?.file_path;
  const fileName = filePath?.split("/").pop() ?? "file";
  const content = input?.content || "";
  const lineCount = useMemo(() => (content ? content.split("\n").length : 0), [content]);

  const handleFileClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (filePath) app.opener.open(filePath);
    },
    [app, filePath],
  );

  return (
    <Tool invocation={invocation}>
      <ToolHeader>
        <ToolHeaderIcon icon={FilePlus} />
        <span className="shrink-0">Write {lineCount} lines</span>
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
      </ToolHeader>
      <ToolContent className="bg-transparent p-0">
        {content ? (
          <PierreFile
            file={{ name: fileName, contents: content }}
            options={{
              theme: resolvedTheme === "dark" ? "pierre-dark" : "pierre-light",
              disableFileHeader: true,
            }}
          />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
