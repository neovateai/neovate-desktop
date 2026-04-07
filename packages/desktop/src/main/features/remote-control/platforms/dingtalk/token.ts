import debug from "debug";

import type { DingTalkConfig } from "../../../../../shared/features/remote-control/types";

const log = debug("neovate:remote-control:dingtalk:token");

interface TokenCache {
  accessToken: string;
  expiry: number;
}

let tokenCache: TokenCache | null = null;

export async function getAccessToken(config: DingTalkConfig): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiry > now + 60_000) {
    return tokenCache.accessToken;
  }

  const res = await fetch("https://api.dingtalk.com/v1.0/oauth2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ appKey: config.clientId, appSecret: config.clientSecret }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DingTalk token request failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { accessToken: string; expireIn: number };
  tokenCache = {
    accessToken: data.accessToken,
    expiry: now + data.expireIn * 1000,
  };
  log("token refreshed, expires in %ds", data.expireIn);
  return tokenCache.accessToken;
}

export function invalidateTokenCache(): void {
  tokenCache = null;
}
