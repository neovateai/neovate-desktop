/**
 * @vitest-environment jsdom
 */

import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach, Mock } from "vitest";

import { useFileData, FileNodeItem } from "../hooks/useFileData";

type WatchFn = (dir: string) => () => void;
type DoLoadFn = (dirs: string[], latestNodes: FileNodeItem[]) => void;

describe("useFileData", () => {
  const mockCwd = "/project";
  let mockWatch: Mock<WatchFn>;
  let mockDoLoad: Mock<DoLoadFn>;

  // Helper to create mock file nodes
  const createMockNode = (overrides: Partial<FileNodeItem> = {}): FileNodeItem => ({
    fullPath: "/project/src/utils.ts",
    relPath: "src/utils.ts",
    fileName: "utils.ts",
    isFolder: false,
    parentPath: "/project/src",
    ...overrides,
  });

  beforeEach(() => {
    mockWatch = vi.fn(() => vi.fn());
    mockDoLoad = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("should initialize with empty state", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      expect(result.current.nodes).toEqual([]);
      expect(result.current.expandedKeys.size).toBe(0);
      expect(result.current.selectedKeys.size).toBe(0);
      expect(result.current.renamingKey).toBe("");
    });

    it("should reset all state when reset is called", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Setup some state
      act(() => {
        result.current.updateNodeDir("/project", [
          createMockNode({ fullPath: "/project/file.ts" }),
        ]);
        result.current.select("/project/file.ts");
      });

      expect(result.current.nodes.length).toBeGreaterThan(0);
      expect(result.current.selectedKeys.size).toBeGreaterThan(0);

      // Reset
      act(() => {
        result.current.reset();
      });

      expect(result.current.nodes).toEqual([]);
      expect(result.current.expandedKeys.size).toBe(0);
      expect(result.current.selectedKeys.size).toBe(0);
    });
  });

  describe("toggleExpand", () => {
    it("should expand folder and call doLoad", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      act(() => {
        result.current.toggleExpand("/project/src");
      });

      expect(result.current.expandedKeys.has("/project/src")).toBe(true);
      expect(mockDoLoad).toHaveBeenCalledWith(["/project/src"], []);
    });

    it("should collapse folder and remove children from nodes", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Setup: expand first, then add children
      act(() => {
        result.current.toggleExpand("/project/src");
        result.current.updateNodeDir("/project/src", [
          {
            fullPath: "/project/src/file1.ts",
            relPath: "src/file1.ts",
            fileName: "file1.ts",
            isFolder: false,
          },
          {
            fullPath: "/project/src/file2.ts",
            relPath: "src/file2.ts",
            fileName: "file2.ts",
            isFolder: false,
          },
        ]);
      });

      expect(result.current.expandedKeys.has("/project/src")).toBe(true);
      expect(result.current.nodes).toHaveLength(2);

      // Collapse
      act(() => {
        result.current.toggleExpand("/project/src");
      });

      expect(result.current.expandedKeys.has("/project/src")).toBe(false);
      expect(result.current.nodes).toHaveLength(0);
    });

    it("should cascade unwatch when collapsing parent directory", () => {
      const unwatchParent = vi.fn();
      const unwatchChild = vi.fn();

      // First call returns parent unwatch, second returns child unwatch
      mockWatch.mockReturnValueOnce(unwatchParent).mockReturnValueOnce(unwatchChild);

      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Setup: expand parent and child, load their data
      act(() => {
        result.current.toggleExpand("/project/src");
        result.current.updateNodeDir("/project/src", [
          {
            fullPath: "/project/src/components",
            relPath: "src/components",
            fileName: "components",
            isFolder: true,
          },
        ]);
      });

      act(() => {
        result.current.toggleExpand("/project/src/components");
        result.current.updateNodeDir("/project/src/components", [
          {
            fullPath: "/project/src/components/Button.tsx",
            relPath: "src/components/Button.tsx",
            fileName: "Button.tsx",
            isFolder: false,
          },
        ]);
      });

      // Collapse parent
      act(() => {
        result.current.toggleExpand("/project/src");
      });

      // Both parent and child watchers should be cleaned up
      expect(unwatchParent).toHaveBeenCalled();
      expect(unwatchChild).toHaveBeenCalled();
    });

    it("should load expanded subdirectories when expanding parent", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Setup: mark a subdirectory as previously expanded (in expandedKeys)
      act(() => {
        result.current.toggleExpand("/project/src/utils");
      });

      mockDoLoad.mockClear();

      // Now expand parent - should load both parent and child
      act(() => {
        result.current.updateNodeDir("/project/src", [
          {
            fullPath: "/project/src/components",
            relPath: "src/components",
            fileName: "components",
            isFolder: true,
          },
          {
            fullPath: "/project/src/utils",
            relPath: "src/utils",
            fileName: "utils",
            isFolder: true,
          },
        ]);
        result.current.toggleExpand("/project/src");
      });

      expect(mockDoLoad).toHaveBeenCalled();
      const loadedDirs = mockDoLoad.mock.calls[0][0];
      expect(loadedDirs).toContain("/project/src");
      expect(loadedDirs).toContain("/project/src/utils");
    });
  });

  describe("updateNodeDir", () => {
    it("should add directory contents and start watching", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      const mockFiles = [
        { fullPath: "/project/src/a.ts", relPath: "src/a.ts", fileName: "a.ts", isFolder: false },
        { fullPath: "/project/src/b.ts", relPath: "src/b.ts", fileName: "b.ts", isFolder: false },
      ];

      act(() => {
        result.current.updateNodeDir("/project/src", mockFiles);
      });

      expect(result.current.nodes).toHaveLength(2);
      expect(result.current.nodes[0].parentPath).toBe("/project/src");
      expect(result.current.nodes[1].parentPath).toBe("/project/src");
      expect(mockWatch).toHaveBeenCalledWith("/project/src");
    });

    it("should replace existing directory contents instead of appending", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // First update
      act(() => {
        result.current.updateNodeDir("/project/src", [
          {
            fullPath: "/project/src/old.ts",
            relPath: "src/old.ts",
            fileName: "old.ts",
            isFolder: false,
          },
        ]);
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].fileName).toBe("old.ts");

      // Second update - should replace, not append
      act(() => {
        result.current.updateNodeDir("/project/src", [
          {
            fullPath: "/project/src/new.ts",
            relPath: "src/new.ts",
            fileName: "new.ts",
            isFolder: false,
          },
        ]);
      });

      expect(result.current.nodes).toHaveLength(1);
      expect(result.current.nodes[0].fileName).toBe("new.ts");
    });

    it("should not start duplicate watchers for same directory", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      const files = [
        {
          fullPath: "/project/src/utils.ts",
          relPath: "src/utils.ts",
          fileName: "utils.ts",
          isFolder: false,
        },
      ];

      // Update same directory twice
      act(() => {
        result.current.updateNodeDir("/project/src", files);
        result.current.updateNodeDir("/project/src", files);
      });

      // Watch should only be called once per directory
      expect(mockWatch).toHaveBeenCalledTimes(1);
    });
  });

  describe("selection", () => {
    it("should support single selection", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      act(() => {
        result.current.select("/project/file1.ts");
      });

      expect(result.current.selectedKeys.has("/project/file1.ts")).toBe(true);
      expect(result.current.selectedKeys.size).toBe(1);

      // Select another file - should replace selection
      act(() => {
        result.current.select("/project/file2.ts");
      });

      expect(result.current.selectedKeys.has("/project/file1.ts")).toBe(false);
      expect(result.current.selectedKeys.has("/project/file2.ts")).toBe(true);
      expect(result.current.selectedKeys.size).toBe(1);
    });

    it("should cancel selection", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      act(() => {
        result.current.select("/project/file.ts");
        result.current.cancelSelect();
      });

      expect(result.current.selectedKeys.size).toBe(0);
    });

    it("should auto-remove selection when node disappears from nodes list", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Add and select a node
      act(() => {
        result.current.updateNodeDir("/project", [
          {
            fullPath: "/project/file.ts",
            relPath: "file.ts",
            fileName: "file.ts",
            isFolder: false,
          },
        ]);
        result.current.select("/project/file.ts");
      });

      expect(result.current.selectedKeys.has("/project/file.ts")).toBe(true);

      // Simulate node disappearing (e.g., parent directory collapsed or data refreshed)
      act(() => {
        result.current.updateNodeDir("/project", []);
      });

      // Selection should be removed by useEffect that syncs selectedKeys with nodes
      expect(result.current.selectedKeys.has("/project/file.ts")).toBe(false);
    });
  });

  describe("renameEffect", () => {
    it("should migrate selection state on rename", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Setup: select a file (not a folder) to avoid auto-cleanup by useEffect
      act(() => {
        result.current.updateNodeDir("/project/src", [
          {
            fullPath: "/project/src/old-file.ts",
            relPath: "src/old-file.ts",
            fileName: "old-file.ts",
            isFolder: false,
          },
        ]);
        result.current.select("/project/src/old-file.ts");
        result.current.renameStart("/project/src/old-file.ts");
      });

      expect(result.current.selectedKeys.has("/project/src/old-file.ts")).toBe(true);
      expect(result.current.renamingKey).toBe("/project/src/old-file.ts");

      // Rename
      act(() => {
        result.current.renameEffect("/project/src/old-file.ts", "/project/src/new-file.ts");
      });

      expect(result.current.selectedKeys.has("/project/src/old-file.ts")).toBe(false);
      expect(result.current.selectedKeys.has("/project/src/new-file.ts")).toBe(true);
      expect(result.current.renamingKey).toBe("");
    });

    it("should migrate expanded state on rename", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Setup
      act(() => {
        result.current.toggleExpand("/project/old-folder");
      });

      expect(result.current.expandedKeys.has("/project/old-folder")).toBe(true);

      // Rename
      act(() => {
        result.current.renameEffect("/project/old-folder", "/project/new-folder");
      });

      expect(result.current.expandedKeys.has("/project/old-folder")).toBe(false);
      expect(result.current.expandedKeys.has("/project/new-folder")).toBe(true);
    });

    it("should migrate watcher on rename", () => {
      const unwatch = vi.fn();
      mockWatch.mockReturnValue(unwatch);

      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Start watching a directory
      act(() => {
        result.current.updateNodeDir("/project/old-folder", []);
      });

      // Rename
      act(() => {
        result.current.renameEffect("/project/old-folder", "/project/new-folder");
      });

      // Old watcher should be stopped, new one started
      expect(unwatch).toHaveBeenCalled();
      expect(mockWatch).toHaveBeenLastCalledWith("/project/new-folder");
    });
  });

  describe("focus", () => {
    it("should select existing node immediately", async () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Setup existing node
      act(() => {
        result.current.updateNodeDir("/project/src", [
          {
            fullPath: "/project/src/existing.ts",
            relPath: "src/existing.ts",
            fileName: "existing.ts",
            isFolder: false,
          },
        ]);
      });

      // Focus existing node
      act(() => {
        result.current.focus("/project/src/existing.ts");
      });

      await waitFor(() => {
        expect(result.current.selectedKeys.has("/project/src/existing.ts")).toBe(true);
      });
      expect(mockDoLoad).not.toHaveBeenCalled();
    });

    it("should expand parent directories and load missing data", async () => {
      mockDoLoad.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Focus deeply nested file that doesn't exist yet
      await act(async () => {
        await result.current.focus("/project/src/components/Button.tsx");
      });

      // Verify doLoad was called with parent directories
      expect(mockDoLoad).toHaveBeenCalled();
      const loadedDirs = mockDoLoad.mock.calls[0][0];
      expect(loadedDirs).toContain("/project/src");
      expect(loadedDirs).toContain("/project/src/components");

      // Verify parents are marked as expanded
      expect(result.current.expandedKeys.has("/project/src")).toBe(true);
      expect(result.current.expandedKeys.has("/project/src/components")).toBe(true);
    });

    it("should restore previously expanded subdirectories on focus", async () => {
      mockDoLoad.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Pre-mark a subdirectory as expanded
      act(() => {
        result.current.toggleExpand("/project/src/utils");
      });

      mockDoLoad.mockClear();

      // Focus a sibling path
      await act(async () => {
        await result.current.focus("/project/src/components/Button.tsx");
      });

      // Should include the previously expanded subdirectory in load
      const loadedDirs = mockDoLoad.mock.calls[0][0];
      expect(loadedDirs).toContain("/project/src/utils");
    });
  });

  describe("edge cases", () => {
    it("should handle empty directory updates", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      act(() => {
        result.current.updateNodeDir("/project/empty-dir", []);
      });

      expect(result.current.nodes).toHaveLength(0);
      expect(mockWatch).toHaveBeenCalledWith("/project/empty-dir");
    });

    it("should handle paths with special characters", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      const specialPath = "/project/src/[page]/index.ts";

      act(() => {
        result.current.updateNodeDir("/project/src/[page]", [
          {
            fullPath: specialPath,
            relPath: "src/[page]/index.ts",
            fileName: "index.ts",
            isFolder: false,
          },
        ]);
        result.current.select(specialPath);
      });

      expect(result.current.selectedKeys.has(specialPath)).toBe(true);
    });

    it("should handle rapid toggleExpand calls", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      // Rapid expand/collapse
      act(() => {
        result.current.toggleExpand("/project/src");
        result.current.toggleExpand("/project/src");
        result.current.toggleExpand("/project/src");
        result.current.toggleExpand("/project/src");
      });

      // Note: Due to React's batching, all toggles happen with the same initial state
      // So effectively: expand -> collapse -> expand -> collapse, ending with collapsed

      // Should end up not expanded (even number of toggles)
      expect(result.current.expandedKeys.has("/project/src")).toBe(false);

      // Verify doLoad was called (at least once for the expands)
      // The exact count depends on React's batching behavior
      expect(mockDoLoad).toHaveBeenCalled();
    });

    it("should handle deeply nested paths in focus", async () => {
      mockDoLoad.mockResolvedValue(undefined);

      const { result } = renderHook(() =>
        useFileData({
          cwd: "/a",
          watch: mockWatch,
          doLoad: mockDoLoad,
        }),
      );

      const deepPath = "/a/b/c/d/e/f/file.ts";

      await act(async () => {
        await result.current.focus(deepPath);
      });

      // All parent directories should be loaded
      expect(mockDoLoad).toHaveBeenCalled();
      const loadedDirs = mockDoLoad.mock.calls[0][0];
      expect(loadedDirs).toContain("/a/b");
      expect(loadedDirs).toContain("/a/b/c");
      expect(loadedDirs).toContain("/a/b/c/d");
      expect(loadedDirs).toContain("/a/b/c/d/e");
    });

    it("should work without watch callback", () => {
      const { result } = renderHook(() =>
        useFileData({
          cwd: mockCwd,
          // watch not provided
          doLoad: mockDoLoad,
        }),
      );

      act(() => {
        result.current.updateNodeDir("/project/src", [
          {
            fullPath: "/project/src/file.ts",
            relPath: "src/file.ts",
            fileName: "file.ts",
            isFolder: false,
          },
        ]);
      });

      // Should not throw when watch is undefined
      expect(result.current.nodes).toHaveLength(1);
      // Watch was not provided, so it should not be called
      expect(mockWatch).not.toHaveBeenCalled();
    });
  });
});
