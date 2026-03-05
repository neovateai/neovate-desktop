import { Streamdown } from "streamdown";
import { code } from "@streamdown/code";

type Props = { content: string; streaming?: boolean };

export function MarkdownContent({ content, streaming }: Props) {
  return (
    <Streamdown
      plugins={{ code }}
      mode={streaming ? "streaming" : "static"}
      isAnimating={streaming}
      shikiTheme={["github-light", "github-dark"]}
    >
      {content}
    </Streamdown>
  );
}
