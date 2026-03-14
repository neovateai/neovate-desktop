// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { maximizePart, activeSessions, closeSession } = vi.hoisted(() => ({
  maximizePart: vi.fn(),
  activeSessions: vi.fn().mockResolvedValue([]),
  closeSession: vi.fn(),
}));

vi.mock("../../../core/app", () => ({
  useRendererApp: () => ({
    workbench: {
      layout: {
        maximizePart,
      },
    },
  }),
}));

vi.mock("../../../features/agent/store", () => ({
  useAgentStore: () => vi.fn(),
}));

vi.mock("../../../features/project/store", () => ({
  useProjectStore: () => [],
}));

vi.mock("../../../orpc", () => ({
  client: {
    agent: {
      activeSessions,
      claudeCode: {
        closeSession,
      },
    },
  },
}));

import DebugView from "../debug-view";

describe("DebugView", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    activeSessions.mockResolvedValue([]);
  });

  it("calls maximizePart for content panel from the test button", async () => {
    render(<DebugView />);

    await waitFor(() => {
      expect(activeSessions).toHaveBeenCalled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Maximize content panel" }));

    expect(maximizePart).toHaveBeenCalledWith("contentPanel");
  });
});
