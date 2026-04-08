import { randomBytes } from "node:crypto";

import type {
  BaseInfo,
  GetConfigResp,
  GetUpdatesResp,
  GetUploadUrlResp,
  QRCodeResponse,
  QRStatusResponse,
  SendMessageReq,
  SendTypingReq,
} from "./types";

const VERSION = "0.1.0";

function buildBaseInfo(): BaseInfo {
  return { channel_version: VERSION };
}

function randomWechatUin(): string {
  const uint32 = randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf-8").toString("base64");
}

function buildHeaders(token: string, bodyLen: number): Record<string, string> {
  return {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    Authorization: `Bearer ${token}`,
    "Content-Length": String(bodyLen),
    "X-WECHAT-UIN": randomWechatUin(),
  };
}

function ensureTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

async function apiFetch(params: {
  baseUrl: string;
  endpoint: string;
  body: string;
  token: string;
  timeoutMs: number;
  label: string;
}): Promise<string> {
  const url = new URL(params.endpoint, ensureTrailingSlash(params.baseUrl));
  const headers = buildHeaders(params.token, Buffer.byteLength(params.body, "utf-8"));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const res = await fetch(url.toString(), {
      method: "POST",
      headers,
      body: params.body,
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) throw new Error(`${params.label} ${res.status}: ${text}`);
    return text;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

export async function getUpdates(params: {
  baseUrl: string;
  token: string;
  getUpdatesBuf: string;
  timeoutMs?: number;
}): Promise<GetUpdatesResp> {
  const timeout = params.timeoutMs ?? 35_000;
  try {
    const raw = await apiFetch({
      baseUrl: params.baseUrl,
      endpoint: "ilink/bot/getupdates",
      body: JSON.stringify({
        get_updates_buf: params.getUpdatesBuf,
        base_info: buildBaseInfo(),
      }),
      token: params.token,
      timeoutMs: timeout,
      label: "getUpdates",
    });
    return JSON.parse(raw);
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ret: 0, msgs: [], get_updates_buf: params.getUpdatesBuf };
    }
    throw err;
  }
}

export async function sendMessage(params: {
  baseUrl: string;
  token: string;
  body: SendMessageReq;
}): Promise<void> {
  await apiFetch({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/sendmessage",
    body: JSON.stringify({ ...params.body, base_info: buildBaseInfo() }),
    token: params.token,
    timeoutMs: 15_000,
    label: "sendMessage",
  });
}

export async function getConfig(params: {
  baseUrl: string;
  token: string;
  ilinkUserId: string;
  contextToken?: string;
}): Promise<GetConfigResp> {
  const raw = await apiFetch({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/getconfig",
    body: JSON.stringify({
      ilink_user_id: params.ilinkUserId,
      context_token: params.contextToken,
      base_info: buildBaseInfo(),
    }),
    token: params.token,
    timeoutMs: 10_000,
    label: "getConfig",
  });
  return JSON.parse(raw);
}

export async function sendTyping(params: {
  baseUrl: string;
  token: string;
  body: SendTypingReq;
}): Promise<void> {
  await apiFetch({
    baseUrl: params.baseUrl,
    endpoint: "ilink/bot/sendtyping",
    body: JSON.stringify({ ...params.body, base_info: buildBaseInfo() }),
    token: params.token,
    timeoutMs: 10_000,
    label: "sendTyping",
  });
}

export async function getUploadUrl(params: {
  baseUrl: string;
  token: string;
  filekey: string;
  media_type: number;
  to_user_id: string;
  rawsize: number;
  rawfilemd5: string;
  filesize: number;
  aeskey: string;
}): Promise<GetUploadUrlResp> {
  const { baseUrl, token, ...req } = params;
  const raw = await apiFetch({
    baseUrl,
    endpoint: "ilink/bot/getuploadurl",
    body: JSON.stringify({
      ...req,
      no_need_thumb: true,
      base_info: buildBaseInfo(),
    }),
    token,
    timeoutMs: 15_000,
    label: "getUploadUrl",
  });
  return JSON.parse(raw);
}

export async function fetchQRCode(baseUrl: string): Promise<QRCodeResponse> {
  const base = ensureTrailingSlash(baseUrl);
  const url = `${base}ilink/bot/get_bot_qrcode?bot_type=3`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`QR code fetch failed: ${res.status}`);
  return res.json() as Promise<QRCodeResponse>;
}

export async function pollQRStatus(baseUrl: string, qrcode: string): Promise<QRStatusResponse> {
  const base = ensureTrailingSlash(baseUrl);
  const url = `${base}ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 35_000);
  try {
    const res = await fetch(url, {
      headers: { "iLink-App-ClientVersion": "1" },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`QR status poll failed: ${res.status}`);
    return res.json() as Promise<QRStatusResponse>;
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") return { status: "wait" };
    throw err;
  }
}
