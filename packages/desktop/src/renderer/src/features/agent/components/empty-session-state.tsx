import { MessageSquare } from "lucide-react";

interface EmptySessionStateProps {
  variant?: "full" | "compact";
}

export function EmptySessionState({ variant = "full" }: EmptySessionStateProps) {
  if (variant === "compact") {
    return <p className="px-3 py-2 text-xs text-muted-foreground">No conversations</p>;
  }

  return (
    <div className="flex flex-1 items-center justify-center p-4">
      <div className="text-center">
        <MessageSquare size={48} strokeWidth={1.5} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium text-muted-foreground">No conversations yet</p>
        <p className="text-xs text-muted-foreground">Start a new chat to get going</p>
      </div>
    </div>
  );
}
