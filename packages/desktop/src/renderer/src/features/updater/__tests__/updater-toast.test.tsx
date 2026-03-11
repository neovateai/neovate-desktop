// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { UpdaterState } from "../../../../../shared/features/updater/types";

const { mocks } = vi.hoisted(() => ({
  mocks: {
    add: vi.fn(() => "toast-1"),
    close: vi.fn(),
    update: vi.fn(),
    install: vi.fn(),
    state: { status: "idle" } as UpdaterState,
  },
}));

vi.mock("../../../components/ui/toast", () => ({
  toastManager: {
    add: mocks.add,
    close: mocks.close,
    update: mocks.update,
  },
}));

vi.mock("../../../orpc", () => ({
  client: {
    updater: {
      install: mocks.install,
    },
  },
}));

vi.mock("../hooks", () => ({
  useUpdaterState: () => mocks.state,
}));

import { UpdaterToast } from "../updater-toast";

describe("UpdaterToast", () => {
  beforeEach(() => {
    mocks.add.mockClear();
    mocks.close.mockClear();
    mocks.update.mockClear();
    mocks.install.mockClear();
    mocks.state = { status: "idle" };
  });

  it("closes the success toast when a new check starts", () => {
    const { rerender } = render(<UpdaterToast />);

    mocks.state = { status: "up-to-date" };
    rerender(<UpdaterToast />);

    expect(mocks.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: "success", title: "You're up to date" }),
    );

    mocks.state = { status: "checking" };
    rerender(<UpdaterToast />);

    expect(mocks.close).toHaveBeenCalledWith("toast-1");
  });
});
