import { Streamdown } from "streamdown";

import { markdownBaseComponents } from "../../../components/ai-elements/markdown-base-components";
import { markdownPlugins } from "../../../lib/markdown";

type Props = { content: string; streaming?: boolean };

export function MarkdownContent({ content, streaming }: Props) {
  return (
    <Streamdown
      className="markdown-root"
      components={markdownBaseComponents}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      plugins={markdownPlugins}
      shikiTheme={["github-light", "github-dark"]}
    >
      {content}
    </Streamdown>
  );
}
