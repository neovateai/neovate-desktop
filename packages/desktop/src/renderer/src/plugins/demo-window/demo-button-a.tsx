import { BubbleChatIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "../../components/ui/button";

export default function DemoButtonA() {
  return (
    <Button variant="ghost" size="icon-sm" className="size-7">
      <HugeiconsIcon icon={BubbleChatIcon} size={16} strokeWidth={1.5} />
    </Button>
  );
}
