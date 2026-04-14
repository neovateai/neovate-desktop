import { useEffect, useRef, useState } from "react";

import { usePluginContext } from "../../core/app";

export default function PreviewView() {
  const { orpcClient } = usePluginContext();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [html, setHtml] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    const client = orpcClient as any;

    (async () => {
      try {
        const stream = await client["demo-mcp-live-preview"].stream(undefined, {
          signal: controller.signal,
        });
        for await (const chunk of stream) {
          setHtml(chunk as string);
        }
      } catch (err) {
        if ((err as Error)?.name !== "AbortError") {
          console.error("[live-preview] stream error:", err);
        }
      }
    })();

    return () => controller.abort();
  }, [orpcClient]);

  useEffect(() => {
    if (iframeRef.current) {
      iframeRef.current.srcdoc = html;
    }
  }, [html]);

  return (
    <div className="flex h-full flex-col">
      {html ? (
        <iframe
          ref={iframeRef}
          title="Live Preview"
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin"
        />
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Waiting for Agent to call the{" "}
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">preview</code>{" "}
          tool…
        </div>
      )}
    </div>
  );
}
