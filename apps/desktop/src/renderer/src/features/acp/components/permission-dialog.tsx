import { Button } from "../../../components/ui/button";
import type { PendingPermission } from "../store";

type Props = {
  permission: PendingPermission;
  onResolve: (requestId: string, optionId: string) => void;
};

export function PermissionDialog({ permission, onResolve }: Props) {
  const { requestId, data } = permission;

  return (
    <div className="mx-4 mb-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-4">
      <p className="mb-2 text-sm font-medium">Permission requested: {data.toolCall.title}</p>
      <div className="flex flex-wrap gap-2">
        {data.options.map((option) => (
          <Button
            key={option.optionId}
            size="sm"
            variant={option.kind === "allow_once" ? "default" : "outline"}
            onClick={() => onResolve(requestId, option.optionId)}
          >
            {option.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
