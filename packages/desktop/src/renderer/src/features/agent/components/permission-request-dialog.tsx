import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";

import type { ClaudeCodeUIEventRequest } from "../../../../../shared/claude-code/types";

import { Button } from "../../../components/ui/button";

type Props = {
  request: ClaudeCodeUIEventRequest;
  onResolve: (result: PermissionResult) => void;
};

export function PermissionRequestDialog({ request, onResolve }: Props) {
  return (
    <div className="relative rounded-2xl border border-yellow-500/30 bg-white p-4 shadow-[0_16px_40px_-20px_rgba(0,0,0,0.3)]">
      <p className="mb-1 text-sm font-medium">Permission requested: {request.toolName}</p>
      {request.input != null && (
        <pre className="mb-2 max-h-24 overflow-auto rounded bg-muted/50 p-2 text-xs">
          {JSON.stringify(request.input, null, 2)}
        </pre>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="default" onClick={() => onResolve({ behavior: "allow" })}>
          Allow
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve({ behavior: "deny", message: "User denied" })}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
