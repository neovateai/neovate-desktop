import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { call } from "@orpc/server";
import { StorageService } from "../../../core/storage-service";
import { storageRouter } from "../router";
import type { AppContext } from "../../../router";

/**
 * End-to-end router tests — calls actual ORPC handlers with a real
 * StorageService + electron-store on /tmp, then verifies data on disk.
 */

const TEST_DIR = path.join("/tmp", "neovate-router-e2e-" + process.pid);
const NS = "config";

let storage: StorageService;
let context: AppContext;

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
  storage = new StorageService({ baseDir: TEST_DIR });
  context = {
    storage,
    sessionManager: {} as any,
    configStore: {} as any,
    projectStore: {} as any,
    mainApp: {} as any,
    stateStore: {} as any,
  };
});

afterEach(() => {
  storage.dispose();
  fs.rmSync(TEST_DIR, { recursive: true, force: true });
});

function readJsonFile(namespace: string): Record<string, unknown> {
  const filePath = path.join(TEST_DIR, `${namespace}.json`);
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

describe("Storage router E2E", () => {
  describe("set → persisted to disk", () => {
    it("writes value and can be read back from JSON file", async () => {
      await call(storageRouter.set, { namespace: NS, key: "theme", value: "dark" }, { context });

      const data = readJsonFile(NS);
      expect(data.theme).toBe("dark");
    });

    it("dot-notation creates nested structure on disk", async () => {
      await call(storageRouter.set, { namespace: NS, key: "a.b.c", value: 42 }, { context });

      const data = readJsonFile(NS);
      expect(data).toEqual({ a: { b: { c: 42 } } });
    });
  });

  describe("get → reads persisted data", () => {
    it("returns value after set", async () => {
      await call(storageRouter.set, { namespace: NS, key: "theme", value: "dark" }, { context });
      const result = await call(storageRouter.get, { namespace: NS, key: "theme" }, { context });

      expect(result).toBe("dark");
    });

    it("returns undefined for missing key", async () => {
      const result = await call(storageRouter.get, { namespace: NS, key: "missing" }, { context });
      expect(result).toBeUndefined();
    });

    it("returns defaultValue for missing key", async () => {
      const result = await call(
        storageRouter.get,
        { namespace: NS, key: "theme", defaultValue: "system" },
        { context },
      );
      expect(result).toBe("system");
    });

    it("returns actual value over defaultValue", async () => {
      await call(storageRouter.set, { namespace: NS, key: "theme", value: "dark" }, { context });
      const result = await call(
        storageRouter.get,
        { namespace: NS, key: "theme", defaultValue: "system" },
        { context },
      );
      expect(result).toBe("dark");
    });
  });

  describe("shallowMerge → persisted to disk", () => {
    it("writes multiple top-level keys at once", async () => {
      await call(
        storageRouter.shallowMerge,
        { namespace: NS, object: { theme: "dark", fontSize: 14 } },
        { context },
      );

      const data = readJsonFile(NS);
      expect(data).toEqual({ theme: "dark", fontSize: 14 });
    });

    it("preserves existing top-level keys not in the merged object", async () => {
      await call(storageRouter.set, { namespace: NS, key: "existing", value: "keep" }, { context });
      await call(
        storageRouter.shallowMerge,
        { namespace: NS, object: { added: "new" } },
        { context },
      );

      const data = readJsonFile(NS);
      expect(data).toEqual({ existing: "keep", added: "new" });
    });

    it("overwrites a top-level key when the merged object includes it", async () => {
      await call(storageRouter.set, { namespace: NS, key: "theme", value: "light" }, { context });
      await call(
        storageRouter.shallowMerge,
        { namespace: NS, object: { theme: "dark" } },
        { context },
      );

      const data = readJsonFile(NS);
      expect(data.theme).toBe("dark");
    });

    it("SHALLOW merge: replaces nested object entirely, does not deep-merge", async () => {
      // Store a nested object with two keys
      await call(
        storageRouter.set,
        { namespace: NS, key: "prefs", value: { fontSize: 14, theme: "light" } },
        { context },
      );

      // merge with a partial nested object — only contains fontSize
      await call(
        storageRouter.shallowMerge,
        { namespace: NS, object: { prefs: { fontSize: 16 } } },
        { context },
      );

      const data = readJsonFile(NS);
      // shallow merge replaces prefs entirely: theme is lost
      expect(data.prefs).toEqual({ fontSize: 16 });
      expect((data.prefs as any).theme).toBeUndefined();
    });
  });

  describe("has", () => {
    it("returns false for missing key", async () => {
      const result = await call(storageRouter.has, { namespace: NS, key: "missing" }, { context });
      expect(result).toBe(false);
    });

    it("returns true after set", async () => {
      await call(storageRouter.set, { namespace: NS, key: "theme", value: "dark" }, { context });
      const result = await call(storageRouter.has, { namespace: NS, key: "theme" }, { context });
      expect(result).toBe(true);
    });
  });

  describe("delete → removed from disk", () => {
    it("removes key and verifies on disk", async () => {
      await call(storageRouter.set, { namespace: NS, key: "theme", value: "dark" }, { context });
      await call(storageRouter.delete, { namespace: NS, key: "theme" }, { context });

      const data = readJsonFile(NS);
      expect(data.theme).toBeUndefined();

      const has = await call(storageRouter.has, { namespace: NS, key: "theme" }, { context });
      expect(has).toBe(false);
    });
  });

  describe("appendToArray → persisted to disk", () => {
    it("creates array and appends", async () => {
      await call(
        storageRouter.appendToArray,
        { namespace: NS, key: "tags", value: "a" },
        { context },
      );
      await call(
        storageRouter.appendToArray,
        { namespace: NS, key: "tags", value: "b" },
        { context },
      );

      const data = readJsonFile(NS);
      expect(data.tags).toEqual(["a", "b"]);
    });
  });

  describe("getAll", () => {
    it("returns empty object for fresh namespace", async () => {
      const result = await call(storageRouter.getAll, { namespace: NS }, { context });
      expect(result).toEqual({});
    });

    it("returns all persisted data", async () => {
      await call(storageRouter.set, { namespace: NS, key: "theme", value: "dark" }, { context });
      await call(storageRouter.set, { namespace: NS, key: "fontSize", value: 14 }, { context });

      const result = await call(storageRouter.getAll, { namespace: NS }, { context });
      expect(result).toEqual({ theme: "dark", fontSize: 14 });
    });
  });

  describe("cross-namespace isolation", () => {
    it("different namespaces do not interfere", async () => {
      await call(storageRouter.set, { namespace: "config", key: "k", value: "v1" }, { context });
      await call(storageRouter.set, { namespace: "projects", key: "k", value: "v2" }, { context });

      const r1 = await call(storageRouter.get, { namespace: "config", key: "k" }, { context });
      const r2 = await call(storageRouter.get, { namespace: "projects", key: "k" }, { context });
      expect(r1).toBe("v1");
      expect(r2).toBe("v2");

      // verify on disk too
      expect(readJsonFile("config")).toEqual({ k: "v1" });
      expect(readJsonFile("projects")).toEqual({ k: "v2" });
    });
  });
});
