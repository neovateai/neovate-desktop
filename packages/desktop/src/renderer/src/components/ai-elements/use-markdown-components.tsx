import type { Components } from "streamdown";

import { useMemo } from "react";

import { useRendererApp } from "../../core/app";
import { markdownBaseComponents } from "./markdown-base-components";

export function useMarkdownComponents(): Components {
  const app = useRendererApp();
  const BaseLink = markdownBaseComponents.a!;

  return useMemo(
    () => ({
      ...markdownBaseComponents,
      a: (props: React.ComponentProps<"a">) => (
        <BaseLink
          {...props}
          onClick={(e: React.MouseEvent) => {
            if (props.href) {
              e.preventDefault();
              app.opener.open(props.href);
            }
          }}
        />
      ),
    }),
    [app.opener, BaseLink],
  );
}
