import { code } from "@streamdown/code";
import { Streamdown } from "streamdown";

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
