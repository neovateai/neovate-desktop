import type { BundledLanguage } from "shiki";

import { AlertCircle } from "lucide-react";

import type { WriteUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock } from "../../../../components/ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";
import { OpenInEditorButton } from "./open-in-editor-button";

export function WriteTool({ invocation }: { invocation: WriteUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, errorText } = invocation;

  const language = (input?.file_path?.match(/\.(\w+)$/)?.[1] ?? "typescript") as BundledLanguage;
  const filePath = input?.file_path;
  const title = filePath ? `Write ${filePath}` : undefined;
  const hasError = state === "output-error";

  return (
    <Tool>
      <div className="flex items-center gap-1">
        <ToolHeader type="tool-Write" state={state} title={title} />
        {filePath && <OpenInEditorButton filePath={filePath} />}
      </div>
      <ToolContent>
        {hasError && errorText ? (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{errorText}</span>
          </div>
        ) : input?.content ? (
          <CodeBlock code={input.content} language={language} className="text-xs" />
        ) : null}
      </ToolContent>
    </Tool>
  );
}
