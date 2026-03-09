import { CursorInWindowIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "../../components/ui/button";
import { client } from "../../orpc";

export default function OpenDemoWindowButton() {
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className="size-7"
      title="Open Demo Window"
      onClick={() =>
        client.window.open({
          windowType: "demo",
          width: 400,
          height: 300,
          title: "Demo Window",
        })
      }
    >
      <HugeiconsIcon icon={CursorInWindowIcon} size={16} strokeWidth={1.5} />
    </Button>
  );
}
