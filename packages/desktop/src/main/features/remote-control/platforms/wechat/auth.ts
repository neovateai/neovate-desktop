import debug from "debug";
import QRCode from "qrcode";

import type { QRStatusResponse } from "./types";

import { fetchQRCode, pollQRStatus } from "./api";

const log = debug("neovate:remote-control:wechat:auth");

const LOGIN_TIMEOUT_MS = 480_000;
const MAX_QR_REFRESH = 3;

export type QRLoginCallbacks = {
  onQRCode: (qrCodeImgContent: string) => void;
  onScanned: () => void;
  onError: (error: string) => void;
};

export type QRLoginResult = {
  token: string;
  accountId: string;
  baseUrl: string;
  userId?: string;
};

/**
 * Perform QR code login against the iLink Bot API.
 * Calls back with QR image data and scan status updates.
 * Returns account info on success.
 */
export async function performQRLogin(
  baseUrl: string,
  callbacks: QRLoginCallbacks,
  signal: AbortSignal,
): Promise<QRLoginResult> {
  let qr = await fetchQRCode(baseUrl);
  let refreshCount = 1;

  let qrDataUrl = await QRCode.toDataURL(qr.qrcode_img_content, { width: 256, margin: 2 });
  callbacks.onQRCode(qrDataUrl);
  log("QR code generated, awaiting scan");

  const deadline = Date.now() + LOGIN_TIMEOUT_MS;
  let scannedEmitted = false;

  while (Date.now() < deadline) {
    if (signal.aborted) throw new Error("Login aborted");

    const status: QRStatusResponse = await pollQRStatus(baseUrl, qr.qrcode);

    switch (status.status) {
      case "wait":
        break;
      case "scaned":
        if (!scannedEmitted) {
          callbacks.onScanned();
          scannedEmitted = true;
          log("QR code scanned");
        }
        break;
      case "expired":
        refreshCount++;
        if (refreshCount > MAX_QR_REFRESH) {
          throw new Error("QR code expired too many times");
        }
        log("QR expired, refreshing (%d/%d)", refreshCount, MAX_QR_REFRESH);
        qr = await fetchQRCode(baseUrl);
        scannedEmitted = false;
        qrDataUrl = await QRCode.toDataURL(qr.qrcode_img_content, { width: 256, margin: 2 });
        callbacks.onQRCode(qrDataUrl);
        break;
      case "confirmed": {
        if (!status.ilink_bot_id || !status.bot_token) {
          throw new Error("Login confirmed but missing bot_id or token");
        }
        log("Login confirmed: accountId=%s", status.ilink_bot_id);
        return {
          token: status.bot_token,
          accountId: status.ilink_bot_id,
          baseUrl: status.baseurl || baseUrl,
          userId: status.ilink_user_id,
        };
      }
    }

    await sleep(1000, signal);
  }

  throw new Error("Login timed out");
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Login aborted"));
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new Error("Login aborted"));
      },
      { once: true },
    );
  });
}
