import { Streamdown } from "streamdown";

import { markdownPlugins } from "../../../lib/markdown";
import { useMarkdownComponents } from "../hooks/use-markdown-components";

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
