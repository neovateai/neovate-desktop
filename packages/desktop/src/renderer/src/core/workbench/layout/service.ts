import type {
  CollapsibleWorkbenchPartId,
  IWorkbenchLayoutService,
  MaximizableWorkbenchPartId,
} from "./types";

interface LayoutAdapter {
  isExpanded(part: CollapsibleWorkbenchPartId): boolean;
  togglePart(part: CollapsibleWorkbenchPartId): void | Promise<void>;
  maximizeContentPanel(): void | Promise<void>;
}

export class WorkbenchLayoutService implements IWorkbenchLayoutService {
  // Transitional seam: the current service adapts the existing app-layout store.
  // Store ownership can move into this service later, when app-layout UI is ready
  // to consume workbench.layout as its state source.
  constructor(private readonly adapter: LayoutAdapter) {}

  async expandPart(part: CollapsibleWorkbenchPartId): Promise<void> {
    if (this.adapter.isExpanded(part)) return;
    await this.adapter.togglePart(part);
  }

  async collapsePart(part: CollapsibleWorkbenchPartId): Promise<void> {
    if (!this.adapter.isExpanded(part)) return;
    await this.adapter.togglePart(part);
  }

  async togglePart(part: CollapsibleWorkbenchPartId): Promise<void> {
    await this.adapter.togglePart(part);
  }

  async maximizePart(part: MaximizableWorkbenchPartId): Promise<void> {
    if (part !== "contentPanel") return;
    if (!this.adapter.isExpanded("contentPanel")) return;
    await this.adapter.maximizeContentPanel();
  }
}
