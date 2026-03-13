import { ProjectSelector } from "../../project/components/project-selector";

export function WelcomePanel() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 text-muted-foreground">
      {/* <MessageCircle className="size-12 opacity-50" /> */}
      <img src="/src/assets/images/logo.png" className="w-[120px]" />
      <p className="text-lg text-center font-bold text-foreground">Start a conversation</p>
      <div className="mt-2">
        <ProjectSelector variant="select" />
      </div>
    </div>
  );
}
