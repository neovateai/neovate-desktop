import { describe, it, expect, vi, beforeEach } from "vitest";
import { SettingsService } from "../settings-service";
import { StorageService } from "../storage-service";

// Same electron-store mock — replicate dot-path get/set behavior
vi.mock("electron-store", () => {
  return {
    default: vi.fn(function (this: any) {
      let data: Record<string, unknown> = {};
      this.get = function (key: string) {
        const parts = key.split(".");
        let current: any = data;
        for (const part of parts) {
          if (current == null) return undefined;
          current = current[part];
        }
        return current;
      };
      this.set = function (keyOrObj: string | Record<string, unknown>, value?: unknown) {
        if (typeof keyOrObj === "string") {
          const parts = keyOrObj.split(".");
          let current: any = data;
          for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] == null) current[parts[i]] = {};
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = value;
        } else {
          Object.assign(data, keyOrObj);
        }
      };
      this.delete = function (key: string) {
        const parts = key.split(".");
        let current: any = data;
        for (let i = 0; i < parts.length - 1; i++) {
          if (current == null) return;
          current = current[parts[i]];
        }
        if (current != null) delete current[parts[parts.length - 1]];
      };
      Object.defineProperty(this, "store", {
        get() {
          return data;
        },
      });
      this.clear = function () {
        data = {};
      };
    }),
  };
});

describe("SettingsService", () => {
  let storage: StorageService;
  let settingsService: SettingsService;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new StorageService();
    settingsService = new SettingsService(storage);
  });

  it("scoped get reads from settings.{namespace}.{key} in config.json", () => {
    const config = storage.scoped("config");
    config.set("settings.git.autoFetch", true);

    const git = settingsService.scoped("git");
    expect(git.get("autoFetch")).toBe(true);
  });

  it("scoped set writes to settings.{namespace}.{key}", () => {
    const git = settingsService.scoped("git");
    git.set("autoFetch", false);

    const config = storage.scoped("config");
    expect(config.get("settings.git.autoFetch")).toBe(false);
  });

  it("scoped getAll returns only namespace data", () => {
    const git = settingsService.scoped("git");
    git.set("autoFetch", true);
    git.set("defaultBranch", "main");

    const prefs = settingsService.scoped("preferences");
    prefs.set("theme", "dark");

    expect(git.getAll()).toEqual({ autoFetch: true, defaultBranch: "main" });
  });

  it("scoped getAll returns empty object for nonexistent namespace", () => {
    const s = settingsService.scoped("nonexistent");
    expect(s.getAll()).toEqual({});
  });

  it("scoped set(key, undefined) deletes the key", () => {
    const git = settingsService.scoped("git");
    git.set("autoFetch", true);
    git.set("autoFetch", undefined);
    expect(git.get("autoFetch")).toBeUndefined();
  });

  it("getAllSettings returns all settings data", () => {
    const git = settingsService.scoped("git");
    git.set("autoFetch", true);
    const prefs = settingsService.scoped("preferences");
    prefs.set("theme", "dark");

    expect(settingsService.getAllSettings()).toEqual({
      git: { autoFetch: true },
      preferences: { theme: "dark" },
    });
  });
});
