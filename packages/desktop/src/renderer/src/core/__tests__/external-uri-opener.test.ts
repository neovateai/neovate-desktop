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
    canOpenExternalUri: vi.fn(async () => true),
    openExternalUri: vi.fn(async () => true),
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
  it("registers itself as external opener in OpenerService", async () => {
    const opener = makeOpener();
    externalService.registerExternalUriOpener("test", opener, makeMetadata());

    // Trigger via OpenerService — should reach ExternalUriOpenerService
    const result = await openerService.open("https://example.com");
    expect(result).toBe(true);
    expect(opener.openExternalUri).toHaveBeenCalled();
  });

  it("filters openers by scheme", async () => {
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

    await openerService.open("https://example.com");

    expect(httpOpener.canOpenExternalUri).toHaveBeenCalled();
    expect(fileOpener.canOpenExternalUri).not.toHaveBeenCalled();
  });

  it("calls canOpenExternalUri before openExternalUri", async () => {
    const opener = makeOpener({ canOpenExternalUri: vi.fn(async () => false) });
    externalService.registerExternalUriOpener("test", opener, makeMetadata());

    // Stub window.open to prevent fallback side effects
    vi.stubGlobal("window", { open: vi.fn() });

    await openerService.open("https://example.com");

    expect(opener.canOpenExternalUri).toHaveBeenCalled();
    expect(opener.openExternalUri).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("tries next opener when canOpenExternalUri returns false", async () => {
    const declining = makeOpener({ canOpenExternalUri: vi.fn(async () => false) });
    const accepting = makeOpener();

    externalService.registerExternalUriOpener("declining", declining, makeMetadata());
    externalService.registerExternalUriOpener("accepting", accepting, makeMetadata());

    await openerService.open("https://example.com");

    expect(declining.canOpenExternalUri).toHaveBeenCalled();
    expect(accepting.openExternalUri).toHaveBeenCalled();
  });

  it("returns false when no opener handles the URI", async () => {
    const declining = makeOpener({
      canOpenExternalUri: vi.fn(async () => false),
    });
    externalService.registerExternalUriOpener("test", declining, makeMetadata());

    // Stub window.open — ExternalUriOpenerService returns false, OpenerService falls back
    const windowOpenSpy = vi.fn();
    vi.stubGlobal("window", { open: windowOpenSpy });

    await openerService.open("https://example.com");

    // ExternalUriOpenerService declined, so OpenerService falls back to window.open
    expect(windowOpenSpy).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it("passes OpenExternalUriContext with sourceUri", async () => {
    const opener = makeOpener();
    externalService.registerExternalUriOpener("test", opener, makeMetadata());

    await openerService.open("https://example.com");

    expect(opener.openExternalUri).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ sourceUri: "https://example.com" }),
    );
  });

  describe("dispose", () => {
    it("removes opener on dispose", async () => {
      const opener = makeOpener();
      const disposable = externalService.registerExternalUriOpener("test", opener, makeMetadata());

      disposable.dispose();

      vi.stubGlobal("window", { open: vi.fn() });
      await openerService.open("https://example.com");

      expect(opener.canOpenExternalUri).not.toHaveBeenCalled();

      vi.unstubAllGlobals();
    });
  });
});
