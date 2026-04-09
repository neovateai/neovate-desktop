import type { BundledLanguage } from "shiki";

import { FileText } from "lucide-react";

import type { ReadUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { CodeBlock, CodeBlockCopyButton } from "../../../../components/ai-elements/code-block";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolHeaderIcon,
} from "../../../../components/ai-elements/tool";
import { OpenInEditorButton } from "./open-in-editor-button";

export function ReadTool({ invocation }: { invocation: ReadUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input, output, errorText } = invocation;

  const code = output?.text ? output.text.replace(/^\s*(\d+)→/gm, "") : undefined;
  const language = (input?.file_path?.match(/\.(\w+)$/)?.[1] ?? "typescript") as BundledLanguage;
  const filePath = input?.file_path;
  const fileName = filePath?.split("/").pop();

  return (
    <Tool state={state} errorText={errorText}>
      <div className="flex items-center gap-1">
        <ToolHeader>
          <ToolHeaderIcon icon={FileText} />
          Read {fileName}
        </ToolHeader>
        {filePath && <OpenInEditorButton filePath={filePath} />}
      </div>
      <ToolContent>
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
      </ToolContent>
    </Tool>
  );
}
