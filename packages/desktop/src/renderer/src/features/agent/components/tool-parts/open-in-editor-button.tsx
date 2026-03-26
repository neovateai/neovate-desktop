import { ExternalLink } from "lucide-react";
import { useCallback } from "react";

import { useRendererApp } from "../../../../core/app";

export function OpenInEditorButton({ filePath }: { filePath: string }) {
  const app = useRendererApp();

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      app.opener.open(filePath);
    },
    [app, filePath],
  );

  return (
    <button
      type="button"
      className="shrink-0 p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
      onClick={handleClick}
      title="Open in editor"
    >
      <ExternalLink className="size-3" />
    </button>
  );
}
