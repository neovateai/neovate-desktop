import { describe, it, expect, vi, beforeEach } from "vitest";
import { StorageService } from "../storage-service";

// Mock electron-store — replicate its dot-path get/set behavior
vi.mock("electron-store", () => {
  const MockStore = vi.fn(function (this: any) {
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
    this.clear = function () {
      data = {};
    };
    Object.defineProperty(this, "store", {
      get() {
        return data;
      },
    });
  });
  return { default: MockStore };
});

describe("StorageService", () => {
  let service: StorageService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new StorageService();
  });

  it("creates scoped storage that can get and set", () => {
    const config = service.scoped("config");
    config.set("theme", "dark");
    expect(config.get("theme")).toBe("dark");
  });

  it("lazily creates electron-store instances", async () => {
    const Store = vi.mocked((await import("electron-store")).default);
    const countBefore = Store.mock.calls.length;
    service.scoped("config");
    service.scoped("config"); // same namespace — no new instance
    expect(Store.mock.calls.length).toBe(countBefore + 1);
    service.scoped("projects"); // different namespace — new instance
    expect(Store.mock.calls.length).toBe(countBefore + 2);
  });

  it("scoped getAll returns all data", () => {
    const config = service.scoped("config");
    config.set("theme", "dark");
    config.set("fontSize", 14);
    const all = config.getAll();
    expect(all).toEqual({ theme: "dark", fontSize: 14 });
  });

  it("different namespaces are isolated", () => {
    const config = service.scoped("config");
    const projects = service.scoped("projects");
    config.set("theme", "dark");
    expect(projects.get("theme")).toBeUndefined();
  });

  it("supports subdirectory namespaces", async () => {
    const Store = vi.mocked((await import("electron-store")).default);
    service.scoped("plugin-data/git");
    const lastCall = Store.mock.calls.at(-1)?.[0] as any;
    expect(lastCall.name).toBe("git");
    expect(lastCall.cwd).toContain("plugin-data");
  });
});
