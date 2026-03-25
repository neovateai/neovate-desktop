import { describe, it, expect, vi, beforeEach } from "vitest";

import type { IExternalOpener, IOpener } from "../opener";

import { OpenerService } from "../opener";

// Stub window.open
const windowOpenSpy = vi.fn();
vi.stubGlobal("window", { open: windowOpenSpy });

let opener: OpenerService;

beforeEach(() => {
  opener = new OpenerService();
  windowOpenSpy.mockClear();
});

describe("OpenerService", () => {
  describe("normalize", () => {
    it("passes through valid URLs", async () => {
      const spy = vi.fn(async () => true);
      opener.registerOpener({ open: spy });
      await opener.open("https://example.com");
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ href: "https://example.com/" }));
    });

    it("converts bare paths to file:// URLs", async () => {
      const spy = vi.fn(async (_url: URL) => true);
      opener.registerOpener({ open: spy });
      await opener.open("/src/main.ts");
      const url = spy.mock.calls[0][0];
      expect(url.protocol).toBe("file:");
      expect(url.pathname).toBe("/src/main.ts");
    });

    it("converts path:line to file:// URL with hash fragment", async () => {
      const spy = vi.fn(async (_url: URL) => true);
      opener.registerOpener({ open: spy });
      await opener.open("/src/main.ts:42");
      const url = spy.mock.calls[0][0];
      expect(url.protocol).toBe("file:");
      expect(url.pathname).toBe("/src/main.ts");
      expect(url.hash).toBe("#42");
    });

    it("encodes spaces in path segments", async () => {
      const spy = vi.fn(async (_url: URL) => true);
      opener.registerOpener({ open: spy });
      await opener.open("/my project/file name.ts");
      const url = spy.mock.calls[0][0];
      expect(url.protocol).toBe("file:");
      expect(decodeURIComponent(url.pathname)).toBe("/my project/file name.ts");
    });

    it("encodes # in path segments so it is not parsed as fragment", async () => {
      const spy = vi.fn(async (_url: URL) => true);
      opener.registerOpener({ open: spy });
      await opener.open("/path/to/#readme.md");
      const url = spy.mock.calls[0][0];
      expect(url.protocol).toBe("file:");
      expect(url.hash).toBe("");
      expect(decodeURIComponent(url.pathname)).toBe("/path/to/#readme.md");
    });

    it("returns false for unparseable input", async () => {
      expect(await opener.open("not a url or path")).toBe(false);
    });
  });

  describe("resolution chain", () => {
    it("tries built-in openers in registration order", async () => {
      const first: IOpener = { open: vi.fn(async () => false) };
      const second: IOpener = { open: vi.fn(async () => true) };
      opener.registerOpener(first);
      opener.registerOpener(second);

      await opener.open("https://example.com");

      expect(first.open).toHaveBeenCalled();
      expect(second.open).toHaveBeenCalled();
    });

    it("stops at first opener that returns true", async () => {
      const first: IOpener = { open: vi.fn(async () => true) };
      const second: IOpener = { open: vi.fn(async () => true) };
      opener.registerOpener(first);
      opener.registerOpener(second);

      await opener.open("https://example.com");

      expect(first.open).toHaveBeenCalled();
      expect(second.open).not.toHaveBeenCalled();
    });

    it("delegates to external opener when built-in openers decline", async () => {
      const external: IExternalOpener = { openExternal: vi.fn(async () => true) };
      opener.registerExternalOpener(external);

      await opener.open("https://example.com");

      expect(external.openExternal).toHaveBeenCalledWith("https://example.com/", {
        sourceUri: "https://example.com",
      });
    });

    it("falls back to window.open for http/https when nothing handles it", async () => {
      await opener.open("https://example.com");
      expect(windowOpenSpy).toHaveBeenCalledWith("https://example.com/");
    });

    it("does not window.open for non-http schemes", async () => {
      expect(await opener.open("file:///foo.txt")).toBe(false);
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });
  });

  describe("registerOpener dispose", () => {
    it("removes opener on dispose", async () => {
      const mock: IOpener = { open: vi.fn(async () => true) };
      const disposable = opener.registerOpener(mock);

      disposable.dispose();
      await opener.open("https://example.com");

      expect(mock.open).not.toHaveBeenCalled();
    });
  });

  describe("registerExternalOpener dispose", () => {
    it("clears external opener on dispose", async () => {
      const external: IExternalOpener = { openExternal: vi.fn(async () => true) };
      const disposable = opener.registerExternalOpener(external);

      disposable.dispose();
      await opener.open("https://example.com");

      expect(external.openExternal).not.toHaveBeenCalled();
      // Falls through to window.open
      expect(windowOpenSpy).toHaveBeenCalled();
    });
  });
});
