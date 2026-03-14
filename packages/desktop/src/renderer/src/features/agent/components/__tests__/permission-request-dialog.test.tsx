// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PermissionRequestDialog } from "../permission-request-dialog";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, number | string>) => {
      if (key === "permission.pendingCount") {
        return `${params?.current}/${params?.total}`;
      }
      return key;
    },
  }),
}));

afterEach(() => {
  cleanup();
});

describe("PermissionRequestDialog", () => {
  it("constrains long blocked paths so they do not widen the dialog", () => {
    const longPath =
      "/Users/dinq/Work/neo-projects/neovate-desktop/packages/desktop/src/renderer/src/features/agent/components/really/long/path/that/should/not/push/the/dialog/outside/the/chat/panel.txt";

    const { container } = render(
      <PermissionRequestDialog
        request={
          {
            type: "permission_request",
            toolName: "Read",
            input: { file_path: longPath },
            options: { blockedPath: longPath, suggestions: [] },
          } as never
        }
        pendingCount={1}
        pendingIndex={0}
        permissionMode="default"
        onResolve={vi.fn()}
      />,
    );

    expect(container.firstElementChild?.className).toContain("min-w-0");
    expect(container.firstElementChild?.className).toContain("max-w-full");

    const reason = screen.getByText((text) => text.includes("blocked access to"));
    expect(reason.className).toContain("break-all");
  });

  it("keeps code previews vertically capped so actions remain visible", () => {
    const { container } = render(
      <PermissionRequestDialog
        request={
          {
            type: "permission_request",
            toolName: "Bash",
            input: { command: "cat <<'EOF'\nline 1\nline 2\nEOF" },
            options: { suggestions: [] },
          } as never
        }
        pendingCount={1}
        pendingIndex={0}
        permissionMode="default"
        onResolve={vi.fn()}
      />,
    );

    expect(container.querySelector('[class*="max-h-24"]')).not.toBeNull();
  });
});
