import type { BundledLanguage } from "shiki";

import { AlertCircle } from "lucide-react";

import type { ReadUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock, CodeBlockCopyButton } from "../../../../components/ai-elements/code-block";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";
import { OpenInEditorButton } from "./open-in-editor-button";

export function ReadTool({ invocation }: { invocation: ReadUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output, errorText } = invocation;

  const code = output?.text ? output.text.replace(/^\s*(\d+)→/gm, "") : undefined;
  const language = (input?.file_path?.match(/\.(\w+)$/)?.[1] ?? "typescript") as BundledLanguage;
  const filePath = input?.file_path;
  const title = filePath ? `Read ${filePath}` : undefined;
  const hasError = state === "output-error";

  return (
    <Tool>
      <div className="flex items-center gap-1">
        <ToolHeader type="tool-Read" state={state} title={title} />
        {filePath && <OpenInEditorButton filePath={filePath} />}
      </div>
      <ToolContent>
        {hasError && errorText ? (
          <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 text-destructive text-sm">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span className="whitespace-pre-wrap">{errorText}</span>
          </div>
        ) : (
          <>
            {output?.images?.length ? (
              <div className="flex flex-wrap gap-2">
                {output.images.map((img, i) => (
                  <img
                    key={i}
                    src={img.url}
                    alt={img.filename ?? "Tool output"}
                    className="max-h-48 rounded-md"
                  />
                ))}
              </div>
            ) : null}
            {code ? (
              <CodeBlock code={code} language={language} className="text-xs">
                <CodeBlockCopyButton />
              </CodeBlock>
            ) : null}
          </>
        )}
      </ToolContent>
    </Tool>
  );
}
