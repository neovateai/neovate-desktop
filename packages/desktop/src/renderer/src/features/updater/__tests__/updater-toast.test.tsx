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

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) => {
      const translations: Record<string, string> = {
        "updater.upToDate": "You're up to date",
        "updater.installFailed": "Update install failed",
        "updater.checkTimedOut": "Update check timed out",
        "updater.genericError": "Update failed",
        "updater.downloading": `Downloading update ${params?.version ?? ""}…`,
        "updater.readyToInstall": `Update ${params?.version ?? ""} ready to install`,
        "updater.readyDescription": `${params?.appName ?? "App"} will quit and reopen to finish updating.`,
        "updater.restart": "Restart",
      };
      return translations[key] ?? key;
    },
  }),
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

  it("shows a short translated install error for install failures", () => {
    mocks.state = {
      status: "error",
      message: "The operation couldn’t be completed. Bad file descriptor",
    };

    render(<UpdaterToast />);

    expect(mocks.add).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error", title: "Update install failed" }),
    );
  });
});
