import type { Disposable } from "./disposable";

export interface IOpener {
  open(resource: URL): Promise<boolean>;
}

export interface IExternalOpener {
  openExternal(href: string, ctx: { sourceUri: string }): Promise<boolean>;
}

export class OpenerService {
  private openers: IOpener[] = [];
  private externalOpener: IExternalOpener | null = null;

  registerOpener(opener: IOpener): Disposable {
    this.openers.push(opener);
    return {
      dispose: () => {
        const idx = this.openers.indexOf(opener);
        if (idx !== -1) this.openers.splice(idx, 1);
      },
    };
  }

  registerExternalOpener(opener: IExternalOpener): Disposable {
    this.externalOpener = opener;
    return {
      dispose: () => {
        if (this.externalOpener === opener) this.externalOpener = null;
      },
    };
  }

  async open(resource: string): Promise<boolean> {
    const uri = this.normalize(resource);
    if (!uri) return false;

    for (const opener of this.openers) {
      if (await opener.open(uri)) return true;
    }

    if (
      this.externalOpener &&
      (await this.externalOpener.openExternal(uri.toString(), { sourceUri: resource }))
    ) {
      return true;
    }

    const scheme = uri.protocol.replace(":", "");
    if (scheme === "https" || scheme === "http") {
      window.open(uri.toString());
      return true;
    }

    return false;
  }

  private pathToFileURL(path: string): URL {
    const encoded = path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return new URL(`file://${encoded}`);
  }

  private normalize(resource: string): URL | null {
    try {
      return new URL(resource);
    } catch {}

    const lineMatch = resource.match(/^(.+):(\d+)$/);
    if (lineMatch) {
      const url = this.pathToFileURL(lineMatch[1]);
      url.hash = lineMatch[2];
      return url;
    }
    if (resource.startsWith("/")) {
      return this.pathToFileURL(resource);
    }
    return null;
  }
}
