import type { BundledLanguage } from "shiki";

import { FilePlus } from "lucide-react";

import type { WriteUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";
import { OpenInEditorButton } from "./open-in-editor-button";

export function WriteTool({ invocation }: { invocation: WriteUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, errorText } = invocation;

  const language = (input?.file_path?.match(/\.(\w+)$/)?.[1] ?? "typescript") as BundledLanguage;
  const filePath = input?.file_path;
  const fileName = filePath?.split("/").pop();

  return (
    <Tool state={state} errorText={errorText}>
      <div className="flex items-center gap-1">
        <ToolHeader>
          <ToolHeaderIcon icon={FilePlus} />
          Write {fileName}
        </ToolHeader>
        {filePath && <OpenInEditorButton filePath={filePath} />}
      </div>
      <ToolContent>
        {input?.content ? (
          <CodeBlock code={input.content} language={language} className="text-xs" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
