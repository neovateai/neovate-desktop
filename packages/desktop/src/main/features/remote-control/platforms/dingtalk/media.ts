import debug from "debug";
import { extname } from "node:path";

import type { DingTalkConfig } from "../../../../../shared/features/remote-control/types";

import { getAccessToken } from "./token";

const log = debug("neovate:remote-control:dingtalk:media");

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".bmp", ".webp"]);

export function isImageFilename(filename: string): boolean {
  return IMAGE_EXTS.has(extname(filename).toLowerCase());
}

export async function downloadImage(
  config: DingTalkConfig,
  downloadCode: string,
): Promise<Buffer | null> {
  try {
    const token = await getAccessToken(config);
    const res = await fetch("https://api.dingtalk.com/v1.0/robot/messageFiles/download", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-acs-dingtalk-access-token": token,
      },
      body: JSON.stringify({
        downloadCode,
        robotCode: config.robotCode || config.clientId,
      }),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { downloadUrl?: string };
    if (!data.downloadUrl) return null;

    const fileRes = await fetch(data.downloadUrl);
    if (!fileRes.ok) return null;

    return Buffer.from(await fileRes.arrayBuffer());
  } catch (err) {
    log("image download failed: %O", err);
    return null;
  }
}

export async function uploadMedia(
  config: DingTalkConfig,
  content: Buffer,
  filename: string,
): Promise<string | null> {
  try {
    const token = await getAccessToken(config);
    const mediaType = isImageFilename(filename) ? "image" : "file";

    const form = new FormData();
    form.append("media", new Blob([new Uint8Array(content)]), filename);

    const res = await fetch(
      `https://oapi.dingtalk.com/media/upload?access_token=${token}&type=${mediaType}`,
      { method: "POST", body: form },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as { errcode?: number; media_id?: string };
    if (data.errcode === 0 && data.media_id) {
      return data.media_id;
    }
    log("media upload response error: %O", data);
    return null;
  } catch (err) {
    log("media upload failed: %O", err);
    return null;
  }
}
