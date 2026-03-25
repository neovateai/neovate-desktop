import type { Components } from "streamdown";

import { useMemo } from "react";

import { markdownBaseComponents } from "../../../components/ai-elements/markdown-base-components";
import { useRendererApp } from "../../../core/app";
import { cn } from "../../../lib/utils";

export function useMarkdownComponents(): Components {
  const app = useRendererApp();

  return useMemo(
    () => ({
      ...markdownBaseComponents,
      a: ({ className, children, ...props }: React.ComponentProps<"a">) => (
        <a
          className={cn(
            "text-primary transition-colors underline-offset-2 hover:underline",
            className,
          )}
          {...props}
          onClick={(e) => {
            if (props.href) {
              e.preventDefault();
              app.opener.open(props.href).then((handled) => {
                if (!handled) window.open(props.href);
              });
            }
          }}
        >
          {children}
        </a>
      ),
    }),
    [app.opener],
  );
}
