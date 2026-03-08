import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import { Button } from "../../../components/ui/button";
import type { ClaudeCodeUIEventRequest } from "../../../../../shared/claude-code/types";

type Props = {
  requestId: string;
  request: ClaudeCodeUIEventRequest;
  onResolve: (requestId: string, result: PermissionResult) => void;
};

export function PermissionDialog({ requestId, request, onResolve }: Props) {
  return (
    <div className="mx-4 mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
      <p className="mb-1 text-sm font-medium">Permission requested: {request.toolName}</p>
      {request.input != null && (
        <pre className="mb-2 max-h-24 overflow-auto rounded bg-muted/50 p-2 text-xs">
          {JSON.stringify(request.input, null, 2)}
        </pre>
      )}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="default"
          onClick={() => onResolve(requestId, { behavior: "allow" })}
        >
          Allow
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onResolve(requestId, { behavior: "deny", message: "User denied" })}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}
