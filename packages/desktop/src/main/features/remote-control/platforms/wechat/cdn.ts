import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { getUploadUrl } from "./api";

const DEFAULT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";

export function encryptAesEcb(plaintext: Buffer, key: Buffer): Buffer {
  const cipher = createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

export function decryptAesEcb(ciphertext: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function aesEcbPaddedSize(size: number): number {
  return Math.ceil((size + 1) / 16) * 16;
}

/**
 * Parse CDNMedia.aes_key into a raw 16-byte AES key.
 * Two encodings: base64(raw 16 bytes) or base64(hex string of 16 bytes).
 */
function parseAesKey(aesKeyBase64: string): Buffer {
  const decoded = Buffer.from(aesKeyBase64, "base64");
  if (decoded.length === 16) return decoded;
  if (decoded.length === 32 && /^[0-9a-fA-F]{32}$/.test(decoded.toString("ascii"))) {
    return Buffer.from(decoded.toString("ascii"), "hex");
  }
  throw new Error(`Invalid aes_key length: ${decoded.length}`);
}

function buildCdnDownloadUrl(encryptParam: string, cdnBaseUrl: string): string {
  return `${cdnBaseUrl}/download?encrypted_query_param=${encodeURIComponent(encryptParam)}`;
}

function buildCdnUploadUrl(cdnBaseUrl: string, uploadParam: string, filekey: string): string {
  return `${cdnBaseUrl}/upload?encrypted_query_param=${encodeURIComponent(uploadParam)}&filekey=${encodeURIComponent(filekey)}`;
}

export async function downloadAndDecrypt(
  encryptParam: string,
  aesKeyBase64: string,
  cdnBaseUrl = DEFAULT_CDN_BASE_URL,
): Promise<Buffer> {
  const key = parseAesKey(aesKeyBase64);
  const url = buildCdnDownloadUrl(encryptParam, cdnBaseUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CDN download failed: ${res.status}`);
  const encrypted = Buffer.from(await res.arrayBuffer());
  return decryptAesEcb(encrypted, key);
}

export async function downloadPlain(
  encryptParam: string,
  cdnBaseUrl = DEFAULT_CDN_BASE_URL,
): Promise<Buffer> {
  const url = buildCdnDownloadUrl(encryptParam, cdnBaseUrl);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CDN download failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function uploadFileToCdn(params: {
  content: Buffer;
  toUserId: string;
  baseUrl: string;
  token: string;
  cdnBaseUrl?: string;
  mediaType: number;
}): Promise<{ filekey: string; downloadParam: string; aeskey: string }> {
  const cdnBaseUrl = params.cdnBaseUrl ?? DEFAULT_CDN_BASE_URL;
  const plaintext = params.content;
  const rawsize = plaintext.length;
  const rawfilemd5 = createHash("md5").update(plaintext).digest("hex");
  const filesize = aesEcbPaddedSize(rawsize);
  const filekey = randomBytes(16).toString("hex");
  const aeskey = randomBytes(16);

  const uploadResp = await getUploadUrl({
    baseUrl: params.baseUrl,
    token: params.token,
    filekey,
    media_type: params.mediaType,
    to_user_id: params.toUserId,
    rawsize,
    rawfilemd5,
    filesize,
    aeskey: aeskey.toString("hex"),
  });

  if (!uploadResp.upload_param) {
    throw new Error("getUploadUrl returned no upload_param");
  }

  const ciphertext = encryptAesEcb(plaintext, aeskey);
  const cdnUrl = buildCdnUploadUrl(cdnBaseUrl, uploadResp.upload_param, filekey);

  let downloadParam: string | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(cdnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: new Uint8Array(ciphertext),
    });
    if (res.status >= 400 && res.status < 500) {
      throw new Error(`CDN upload client error: ${res.status}`);
    }
    if (res.status === 200) {
      downloadParam = res.headers.get("x-encrypted-param") ?? undefined;
      if (downloadParam) break;
      throw new Error("CDN response missing x-encrypted-param header");
    }
    if (attempt === 3) throw new Error(`CDN upload failed after 3 attempts: ${res.status}`);
  }

  return { filekey, downloadParam: downloadParam!, aeskey: aeskey.toString("hex") };
}
