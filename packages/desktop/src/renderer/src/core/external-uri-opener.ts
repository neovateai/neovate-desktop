import type { Disposable } from "./disposable";
import type { IExternalOpener, OpenerService } from "./opener";

export interface ExternalUriOpener {
  canOpenExternalUri(uri: URL): Promise<boolean>;
  openExternalUri(resolvedUri: URL, ctx: OpenExternalUriContext): Promise<boolean>;
}

export interface OpenExternalUriContext {
  readonly sourceUri: string;
}

export interface ExternalUriOpenerMetadata {
  readonly schemes: readonly string[];
  readonly label: string;
}

export interface ExternalUriOpenerContribution {
  readonly id: string;
  readonly opener: ExternalUriOpener;
  readonly metadata: ExternalUriOpenerMetadata;
}

export class ExternalUriOpenerService implements IExternalOpener {
  private openers = new Map<
    string,
    { opener: ExternalUriOpener; metadata: ExternalUriOpenerMetadata }
  >();

  constructor(openerService: OpenerService) {
    openerService.registerExternalOpener(this);
  }

  registerExternalUriOpener(
    id: string,
    opener: ExternalUriOpener,
    metadata: ExternalUriOpenerMetadata,
  ): Disposable {
    this.openers.set(id, { opener, metadata });
    return { dispose: () => this.openers.delete(id) };
  }

  async openExternal(href: string, ctx: { sourceUri: string }): Promise<boolean> {
    let uri: URL;
    try {
      uri = new URL(href);
    } catch {
      return false;
    }

    const openCtx: OpenExternalUriContext = { sourceUri: ctx.sourceUri };
    const scheme = uri.protocol.replace(":", "");

    for (const [, { opener, metadata }] of this.openers) {
      if (!metadata.schemes.includes(scheme)) continue;
      if (await opener.canOpenExternalUri(uri)) {
        if (await opener.openExternalUri(uri, openCtx)) return true;
      }
    }

    return false;
  }
}
