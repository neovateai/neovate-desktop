import { Button } from "../../../components/ui/button";
import type { PendingPermission } from "../store";

type Props = {
  permission: PendingPermission;
  onResolve: (requestId: string, allow: boolean) => void;
};

export function PermissionDialog({ permission, onResolve }: Props) {
  const { requestId, toolName, input } = permission;

  return (
    <div className="mx-4 mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
      <p className="mb-1 text-sm font-medium">Permission requested: {toolName}</p>
      {input != null && (
        <pre className="mb-2 max-h-24 overflow-auto rounded bg-muted/50 p-2 text-xs">
          {JSON.stringify(input, null, 2)}
        </pre>
      )}
      <div className="flex gap-2">
        <Button size="sm" variant="default" onClick={() => onResolve(requestId, true)}>
          Allow
        </Button>
        <Button size="sm" variant="outline" onClick={() => onResolve(requestId, false)}>
          Deny
        </Button>
      </div>
    </div>
  );
}
