import type { CollapsibleWorkbenchPartId, IWorkbenchLayoutService } from "./types";

interface LayoutAdapter {
  isExpanded(part: CollapsibleWorkbenchPartId): boolean;
  togglePart(part: CollapsibleWorkbenchPartId): void | Promise<void>;
}

export class WorkbenchLayoutService implements IWorkbenchLayoutService {
  // Transitional seam: the current service adapts the existing app-layout store.
  // Store ownership can move into this service later, when app-layout UI is ready
  // to consume workbench.layout as its state source.
  constructor(private readonly adapter: LayoutAdapter) {}

  expandPart(part: CollapsibleWorkbenchPartId): void | Promise<void> {
    if (this.adapter.isExpanded(part)) return;
    return this.adapter.togglePart(part);
  }

  togglePart(part: CollapsibleWorkbenchPartId): void | Promise<void> {
    return this.adapter.togglePart(part);
  }
}
