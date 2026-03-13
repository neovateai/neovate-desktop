import { describe, expect, it, vi } from "vitest";

import { WorkbenchLayoutService } from "../workbench/layout/service";

function assertMaximizePartTypeContract() {
  const service = new WorkbenchLayoutService({
    isExpanded: vi.fn(() => true),
    togglePart: vi.fn(),
    maximizeContentPanel: vi.fn(),
  });

  // @ts-expect-error maximizePart only accepts contentPanel
  service.maximizePart("primarySidebar");
}

void assertMaximizePartTypeContract;

describe("WorkbenchLayoutService", () => {
  it("expands a collapsed part by delegating to togglePart", () => {
    const togglePart = vi.fn();
    const service = new WorkbenchLayoutService({
      isExpanded: vi.fn(() => false),
      togglePart,
      maximizeContentPanel: vi.fn(),
    });

    service.expandPart("contentPanel");

    expect(togglePart).toHaveBeenCalledWith("contentPanel");
  });

  it("does nothing when the part is already expanded", () => {
    const togglePart = vi.fn();
    const service = new WorkbenchLayoutService({
      isExpanded: vi.fn(() => true),
      togglePart,
      maximizeContentPanel: vi.fn(),
    });

    service.expandPart("contentPanel");

    expect(togglePart).not.toHaveBeenCalled();
  });

  it("delegates togglePart directly to the adapter", () => {
    const togglePart = vi.fn();
    const service = new WorkbenchLayoutService({
      isExpanded: vi.fn(() => true),
      togglePart,
      maximizeContentPanel: vi.fn(),
    });

    service.togglePart("contentPanel");

    expect(togglePart).toHaveBeenCalledWith("contentPanel");
  });

  it("exposes maximizePart", () => {
    const service = new WorkbenchLayoutService({
      isExpanded: vi.fn(() => true),
      togglePart: vi.fn(),
      maximizeContentPanel: vi.fn(),
    });

    expect(typeof service.maximizePart).toBe("function");
  });

  it("delegates maximizePart to maximizeContentPanel when contentPanel is expanded", () => {
    const togglePart = vi.fn();
    const maximizeContentPanel = vi.fn();
    const service = new WorkbenchLayoutService({
      isExpanded: vi.fn((part) => part === "contentPanel"),
      togglePart,
      maximizeContentPanel,
    });

    service.maximizePart("contentPanel");

    expect(maximizeContentPanel).toHaveBeenCalledTimes(1);
    expect(togglePart).not.toHaveBeenCalled();
  });

  it("no-op when contentPanel is collapsed", () => {
    const togglePart = vi.fn();
    const maximizeContentPanel = vi.fn();
    const service = new WorkbenchLayoutService({
      isExpanded: vi.fn(() => false),
      togglePart,
      maximizeContentPanel,
    });

    service.maximizePart("contentPanel");

    expect(maximizeContentPanel).not.toHaveBeenCalled();
    expect(togglePart).not.toHaveBeenCalled();
  });
});
