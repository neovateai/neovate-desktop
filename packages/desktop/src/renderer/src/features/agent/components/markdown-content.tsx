import { Streamdown } from "streamdown";

import { useMarkdownComponents } from "../../../components/ai-elements/use-markdown-components";
import { markdownPlugins } from "../../../lib/markdown";

type Props = { content: string; streaming?: boolean };

export function MarkdownContent({ content, streaming }: Props) {
  const components = useMarkdownComponents();
  return (
    <Streamdown
      className="markdown-root"
      components={components}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      plugins={markdownPlugins}
      shikiTheme={["github-light", "github-dark"]}
    >
      {content}
    </Streamdown>
  );
}
