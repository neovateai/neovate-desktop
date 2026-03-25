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
    it("passes through valid URLs", () => {
      const spy = vi.fn(() => true);
      opener.registerOpener({ open: spy });
      opener.open("https://example.com");
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ href: "https://example.com/" }));
    });

    it("converts bare paths to file:// URLs", () => {
      const spy = vi.fn(() => true);
      opener.registerOpener({ open: spy });
      opener.open("/src/main.ts");
      const url: URL = spy.mock.calls[0][0];
      expect(url.protocol).toBe("file:");
      expect(url.pathname).toBe("/src/main.ts");
    });

    it("converts path:line to file:// URL with hash fragment", () => {
      const spy = vi.fn(() => true);
      opener.registerOpener({ open: spy });
      opener.open("/src/main.ts:42");
      const url: URL = spy.mock.calls[0][0];
      expect(url.protocol).toBe("file:");
      expect(url.pathname).toBe("/src/main.ts");
      expect(url.hash).toBe("#42");
    });

    it("encodes spaces in path segments", () => {
      const spy = vi.fn(() => true);
      opener.registerOpener({ open: spy });
      opener.open("/my project/file name.ts");
      const url: URL = spy.mock.calls[0][0];
      expect(url.protocol).toBe("file:");
      expect(decodeURIComponent(url.pathname)).toBe("/my project/file name.ts");
    });

    it("encodes # in path segments so it is not parsed as fragment", () => {
      const spy = vi.fn(() => true);
      opener.registerOpener({ open: spy });
      opener.open("/path/to/#readme.md");
      const url: URL = spy.mock.calls[0][0];
      expect(url.protocol).toBe("file:");
      expect(url.hash).toBe("");
      expect(decodeURIComponent(url.pathname)).toBe("/path/to/#readme.md");
    });

    it("returns false for unparseable input", () => {
      expect(opener.open("not a url or path")).toBe(false);
    });
  });

  describe("resolution chain", () => {
    it("tries built-in openers in registration order", () => {
      const first: IOpener = { open: vi.fn(() => false) };
      const second: IOpener = { open: vi.fn(() => true) };
      opener.registerOpener(first);
      opener.registerOpener(second);

      opener.open("https://example.com");

      expect(first.open).toHaveBeenCalled();
      expect(second.open).toHaveBeenCalled();
    });

    it("stops at first opener that returns true", () => {
      const first: IOpener = { open: vi.fn(() => true) };
      const second: IOpener = { open: vi.fn(() => true) };
      opener.registerOpener(first);
      opener.registerOpener(second);

      opener.open("https://example.com");

      expect(first.open).toHaveBeenCalled();
      expect(second.open).not.toHaveBeenCalled();
    });

    it("delegates to external opener when built-in openers decline", () => {
      const external: IExternalOpener = { openExternal: vi.fn(() => true) };
      opener.registerExternalOpener(external);

      opener.open("https://example.com");

      expect(external.openExternal).toHaveBeenCalledWith("https://example.com/", {
        sourceUri: "https://example.com",
      });
    });

    it("falls back to window.open for http/https when nothing handles it", () => {
      opener.open("https://example.com");
      expect(windowOpenSpy).toHaveBeenCalledWith("https://example.com/");
    });

    it("does not window.open for non-http schemes", () => {
      expect(opener.open("file:///foo.txt")).toBe(false);
      expect(windowOpenSpy).not.toHaveBeenCalled();
    });
  });

  describe("registerOpener dispose", () => {
    it("removes opener on dispose", () => {
      const mock: IOpener = { open: vi.fn(() => true) };
      const disposable = opener.registerOpener(mock);

      disposable.dispose();
      opener.open("https://example.com");

      expect(mock.open).not.toHaveBeenCalled();
    });
  });

  describe("registerExternalOpener dispose", () => {
    it("clears external opener on dispose", () => {
      const external: IExternalOpener = { openExternal: vi.fn(() => true) };
      const disposable = opener.registerExternalOpener(external);

      disposable.dispose();
      opener.open("https://example.com");

      expect(external.openExternal).not.toHaveBeenCalled();
      // Falls through to window.open
      expect(windowOpenSpy).toHaveBeenCalled();
    });
  });
});
