import { describe, expect, it, vi } from "vitest";

import { WorkbenchLayoutService } from "../workbench/layout/service";

describe("WorkbenchLayoutService", () => {
  it("expands a collapsed part by delegating to togglePart", () => {
    const togglePart = vi.fn();
    const service = new WorkbenchLayoutService({
      isExpanded: vi.fn(() => false),
      togglePart,
    });

    service.expandPart("contentPanel");

    expect(togglePart).toHaveBeenCalledWith("contentPanel");
  });

  it("does nothing when the part is already expanded", () => {
    const togglePart = vi.fn();
    const service = new WorkbenchLayoutService({
      isExpanded: vi.fn(() => true),
      togglePart,
    });

    service.expandPart("contentPanel");

    expect(togglePart).not.toHaveBeenCalled();
  });

  it("delegates togglePart directly to the adapter", () => {
    const togglePart = vi.fn();
    const service = new WorkbenchLayoutService({
      isExpanded: vi.fn(() => true),
      togglePart,
    });

    service.togglePart("contentPanel");

    expect(togglePart).toHaveBeenCalledWith("contentPanel");
  });
});
