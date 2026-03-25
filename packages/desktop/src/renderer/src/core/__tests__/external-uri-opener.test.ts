import { describe, it, expect, vi, beforeEach } from "vitest";

import type { ExternalUriOpener, ExternalUriOpenerMetadata } from "../external-uri-opener";

import { ExternalUriOpenerService } from "../external-uri-opener";
import { OpenerService } from "../opener";

let openerService: OpenerService;
let externalService: ExternalUriOpenerService;

beforeEach(() => {
  openerService = new OpenerService();
  externalService = new ExternalUriOpenerService(openerService);
});

function makeOpener(overrides?: Partial<ExternalUriOpener>): ExternalUriOpener {
  return {
    canOpenExternalUri: vi.fn(() => true),
    openExternalUri: vi.fn(() => true),
    ...overrides,
  };
}

function makeMetadata(overrides?: Partial<ExternalUriOpenerMetadata>): ExternalUriOpenerMetadata {
  return {
    schemes: ["http", "https"],
    label: "Test opener",
    ...overrides,
  };
}

describe("ExternalUriOpenerService", () => {
  it("registers itself as external opener in OpenerService", () => {
    const opener = makeOpener();
    externalService.registerExternalUriOpener("test", opener, makeMetadata());

    // Trigger via OpenerService — should reach ExternalUriOpenerService
    const result = openerService.open("https://example.com");
    expect(result).toBe(true);
    expect(opener.openExternalUri).toHaveBeenCalled();
  });

  it("filters openers by scheme", () => {
    const httpOpener = makeOpener();
    const fileOpener = makeOpener();

    externalService.registerExternalUriOpener(
      "http",
      httpOpener,
      makeMetadata({ schemes: ["http", "https"] }),
    );
    externalService.registerExternalUriOpener(
      "file",
      fileOpener,
      makeMetadata({ schemes: ["file"] }),
    );

    openerService.open("https://example.com");

    expect(httpOpener.canOpenExternalUri).toHaveBeenCalled();
    expect(fileOpener.canOpenExternalUri).not.toHaveBeenCalled();
  });

  it("calls canOpenExternalUri before openExternalUri", () => {
    const opener = makeOpener({ canOpenExternalUri: vi.fn(() => false) });
    externalService.registerExternalUriOpener("test", opener, makeMetadata());

    // Stub window.open to prevent fallback side effects
    vi.stubGlobal("window", { open: vi.fn() });

    openerService.open("https://example.com");

    expect(opener.canOpenExternalUri).toHaveBeenCalled();
    expect(opener.openExternalUri).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("tries next opener when canOpenExternalUri returns false", () => {
    const declining = makeOpener({ canOpenExternalUri: vi.fn(() => false) });
    const accepting = makeOpener();

    externalService.registerExternalUriOpener("declining", declining, makeMetadata());
    externalService.registerExternalUriOpener("accepting", accepting, makeMetadata());

    openerService.open("https://example.com");

    expect(declining.canOpenExternalUri).toHaveBeenCalled();
    expect(accepting.openExternalUri).toHaveBeenCalled();
  });

  it("returns false when no opener handles the URI", () => {
    const declining = makeOpener({
      canOpenExternalUri: vi.fn(() => false),
    });
    externalService.registerExternalUriOpener("test", declining, makeMetadata());

    // Stub window.open — ExternalUriOpenerService returns false, OpenerService falls back
    const windowOpenSpy = vi.fn();
    vi.stubGlobal("window", { open: windowOpenSpy });

    openerService.open("https://example.com");

    // ExternalUriOpenerService declined, so OpenerService falls back to window.open
    expect(windowOpenSpy).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("passes OpenExternalUriContext with sourceUri", () => {
    const opener = makeOpener();
    externalService.registerExternalUriOpener("test", opener, makeMetadata());

    openerService.open("https://example.com");

    expect(opener.openExternalUri).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ sourceUri: "https://example.com" }),
    );
  });

  describe("dispose", () => {
    it("removes opener on dispose", () => {
      const opener = makeOpener();
      const disposable = externalService.registerExternalUriOpener("test", opener, makeMetadata());

      disposable.dispose();

      vi.stubGlobal("window", { open: vi.fn() });
      openerService.open("https://example.com");

      expect(opener.canOpenExternalUri).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });
});
