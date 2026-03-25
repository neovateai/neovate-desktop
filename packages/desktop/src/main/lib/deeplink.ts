import path from "node:path";

import type { DeepLinkPayload, ParsedDeepLink } from "../../shared/features/electron/deeplink";

export const NEO_PROTOCOL = "neo";

export function findDeepLink(argv: string[]): string | undefined {
  return argv.find(
    (arg) => arg.startsWith(`${NEO_PROTOCOL}://`) || arg.startsWith(`${NEO_PROTOCOL}:`),
  );
}

export function parseDeepLink(urlText: string): ParsedDeepLink | null {
  try {
    const url = new URL(urlText);
    if (url.protocol !== `${NEO_PROTOCOL}:`) {
      return null;
    }

    const action = url.hostname || url.pathname.replace(/^\/+/, "");
    const params: Record<string, string> = {};
    url.searchParams.forEach((value, key) => {
      params[key] = value;
    });

    return {
      action,
      params,
    };
  } catch {
    return null;
  }
}

export function resolveDeepLinkIntent(
  deeplink: ParsedDeepLink,
): Omit<DeepLinkPayload, "id"> | null {
  switch (deeplink.action) {
    case "open": {
      const projectPath = deeplink.params.project;
      if (!projectPath || !path.isAbsolute(projectPath)) {
        return null;
      }

      const extras = { ...deeplink.params };
      delete extras.project;

      return {
        action: "open",
        projectPath,
        extras,
      };
    }
    default:
      return null;
  }
}
