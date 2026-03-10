import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { StorageService } from "../storage-service";

/**
 * Integration tests for StorageService's own logic (not electron-store's).
 * Uses real electron-store on /tmp to verify caching, namespace routing,
 * subdirectory support, security, and dispose.
 */

const TEST_DIR = path.join("/tmp", "neovate-storage-svc-test-" + process.pid);

let service: StorageService;

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  service = new StorageService({ baseDir: TEST_DIR });
});

afterEach(() => {
  service.dispose();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("StorageService", () => {
  describe("instance caching", () => {
    it("same namespace returns same instance", () => {
      const a = service.scoped("config");
      const b = service.scoped("config");
      expect(a).toBe(b);
    });

    it("different namespace returns different instance", () => {
      const a = service.scoped("config");
      const b = service.scoped("projects");
      expect(a).not.toBe(b);
    });
  });

  describe("namespace isolation", () => {
    it("different namespaces write to separate JSON files", () => {
      service.scoped("config").set("theme", "dark");
      service.scoped("projects").set("active", "/tmp/project");

      const configPath = path.join(TEST_DIR, "config.json");
      const projectsPath = path.join(TEST_DIR, "projects.json");

      expect(fs.existsSync(configPath)).toBe(true);
      expect(fs.existsSync(projectsPath)).toBe(true);

      const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      expect(configData).toEqual({ theme: "dark" });

      const projectsData = JSON.parse(fs.readFileSync(projectsPath, "utf-8"));
      expect(projectsData).toEqual({ active: "/tmp/project" });
    });

    it("data in one namespace does not leak to another", () => {
      service.scoped("config").set("key", "from-config");
      service.scoped("projects").set("key", "from-projects");
      expect(service.scoped("config").get("key")).toBe("from-config");
      expect(service.scoped("projects").get("key")).toBe("from-projects");
    });
  });

  describe("subdirectory namespaces", () => {
    it("slash-separated namespace creates subdirectory", () => {
      service.scoped("plugins/git").set("enabled", true);

      const filePath = path.join(TEST_DIR, "plugins", "git.json");
      expect(fs.existsSync(filePath)).toBe(true);

      const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
      expect(data).toEqual({ enabled: true });
    });
  });

  describe("security", () => {
    it("rejects empty namespace", () => {
      expect(() => service.scoped("")).toThrow("namespace must not be empty");
    });

    it("rejects path traversal with ../", () => {
      expect(() => service.scoped("../etc")).toThrow("namespace must not contain path traversal");
    });

    it("rejects nested path traversal", () => {
      expect(() => service.scoped("foo/../../bar")).toThrow(
        "namespace must not contain path traversal",
      );
    });
  });

  describe("dispose", () => {
    it("clears cached instances so next scoped() creates new one", () => {
      const before = service.scoped("config");
      service.dispose();
      const after = service.scoped("config");
      expect(before).not.toBe(after);
    });
  });
});
