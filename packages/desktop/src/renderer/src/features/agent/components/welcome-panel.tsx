import { MessageCircle } from "lucide-react";
import { ProjectSelector } from "../../project/components/project-selector";

export function WelcomePanel() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
      <MessageCircle className="size-12 opacity-50" />
      <p className="text-lg text-center">Start a conversation</p>
      <ProjectSelector variant="select" />
    </div>
  );
}
