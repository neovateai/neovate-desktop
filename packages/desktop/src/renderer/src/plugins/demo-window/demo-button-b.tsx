import { Settings03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "../../components/ui/button";

export default function DemoButtonB() {
  return (
    <Button variant="ghost" size="icon-sm" className="size-7">
      <HugeiconsIcon icon={Settings03Icon} size={16} strokeWidth={1.5} />
    </Button>
  );
}
