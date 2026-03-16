import { useTheme } from "next-themes";

import { APP_NAME } from "../../../../../shared/constants";
import { getLogoUrl } from "../../../assets/images";
import { ProjectSelector } from "../../project/components/project-selector";

export function WelcomePanel() {
  const { resolvedTheme } = useTheme();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 text-muted-foreground">
      {/* <MessageCircle className="size-12 opacity-50" /> */}
      <img
        src={getLogoUrl(resolvedTheme as "dark" | "light" | undefined)}
        className="w-[120px]"
        alt={`${APP_NAME} Logo`}
      />
      <p className="text-lg text-center font-bold text-foreground">
        {`Hi, I'm ${APP_NAME}. Let's start chatting!`}
      </p>
      <div className="mt-2">
        <ProjectSelector variant="select" />
      </div>
    </div>
  );
}
