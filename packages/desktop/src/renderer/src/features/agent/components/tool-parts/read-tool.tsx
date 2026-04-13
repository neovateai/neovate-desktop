import { File } from "@pierre/diffs/react";
import { FileText } from "lucide-react";
import { useCallback } from "react";

import type { ReadUIToolInvocation } from "../../../../../../shared/claude-code/types";

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
import { useRendererApp } from "../../../../core";

export function ReadTool({ invocation }: { invocation: ReadUIToolInvocation }) {
  const app = useRendererApp();

  const { state, input, output, errorText } = invocation;
  const filePath = input?.file_path;

  const handleFileClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (filePath) app.opener.open(filePath);
    },
    [app, filePath],
  );

  if (!invocation || invocation.state === "input-streaming") return null;

  const fileName = filePath?.split("/").pop();

  const imageDataUrl =
    output?.type === "image" ? `data:${output.file.type};base64,${output.file.base64}` : undefined;

  return (
    <Tool state={state} errorText={errorText}>
      <ToolHeader>
        <ToolHeaderIcon icon={FileText} />
        <span className="shrink-0">
          Read {output?.type === "text" ? `${output.file.totalLines} lines` : null}
        </span>
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
      <ToolContent>
        {output?.type === "text" ? (
          <File
            file={{ contents: output.file.content, name: fileName || "" }}
            options={{ disableFileHeader: true }}
          />
        ) : null}
        {output?.type === "image" && imageDataUrl ? (
          <div className="flex flex-wrap gap-2">
            <img src={imageDataUrl} alt={fileName} className="max-h-48 rounded-md" />
          </div>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
