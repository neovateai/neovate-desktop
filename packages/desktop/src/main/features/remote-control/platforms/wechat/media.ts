import debug from "debug";

import type { MessageItem } from "./types";

import { downloadAndDecrypt, downloadPlain } from "./cdn";
import { MessageItemType } from "./types";

const log = debug("neovate:remote-control:wechat:media");

export type MediaResult = {
  /** Base64 encoded image data, if an image was found. */
  imageBase64?: string;
  /** MIME type of the image. */
  imageMimeType?: string;
  /** Text content from voice STT. */
  voiceText?: string;
};

/** SILK -> PCM -> WAV, returns null if silk-wasm unavailable. */
async function silkToWav(silkBuf: Buffer): Promise<Buffer | null> {
  try {
    // @ts-expect-error silk-wasm is an optional dependency
    const { decode } = await import("silk-wasm");
    const result = await decode(silkBuf, 24_000);
    const pcm = result.data;
    const pcmBytes = pcm.byteLength;
    const totalSize = 44 + pcmBytes;
    const buf = Buffer.allocUnsafe(totalSize);
    let o = 0;
    buf.write("RIFF", o);
    o += 4;
    buf.writeUInt32LE(totalSize - 8, o);
    o += 4;
    buf.write("WAVE", o);
    o += 4;
    buf.write("fmt ", o);
    o += 4;
    buf.writeUInt32LE(16, o);
    o += 4;
    buf.writeUInt16LE(1, o);
    o += 2;
    buf.writeUInt16LE(1, o);
    o += 2;
    buf.writeUInt32LE(24_000, o);
    o += 4;
    buf.writeUInt32LE(48_000, o);
    o += 4;
    buf.writeUInt16LE(2, o);
    o += 2;
    buf.writeUInt16LE(16, o);
    o += 2;
    buf.write("data", o);
    o += 4;
    buf.writeUInt32LE(pcmBytes, o);
    o += 4;
    Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength).copy(buf, o);
    return buf;
  } catch {
    return null;
  }
}

/**
 * Download and process media from a message's item_list.
 * Returns image as base64 or voice as STT text.
 */
export async function downloadMedia(itemList: MessageItem[] | undefined): Promise<MediaResult> {
  if (!itemList?.length) return {};

  // Try image first
  const imageItem = itemList.find(
    (i) => i.type === MessageItemType.IMAGE && i.image_item?.media?.encrypt_query_param,
  );
  if (imageItem?.image_item) {
    const img = imageItem.image_item;
    const aesKeyBase64 = img.aeskey
      ? Buffer.from(img.aeskey, "hex").toString("base64")
      : img.media?.aes_key;
    try {
      const buf = aesKeyBase64
        ? await downloadAndDecrypt(img.media!.encrypt_query_param!, aesKeyBase64)
        : await downloadPlain(img.media!.encrypt_query_param!);
      return { imageBase64: buf.toString("base64"), imageMimeType: "image/jpeg" };
    } catch (err) {
      log("image download failed: %O", err);
    }
  }

  // Try voice — prefer WeChat STT text, fall back to SILK decode
  const voiceItem = itemList.find((i) => i.type === MessageItemType.VOICE && i.voice_item);
  if (voiceItem?.voice_item) {
    const voice = voiceItem.voice_item;
    if (voice.text) {
      return { voiceText: voice.text };
    }
    if (voice.media?.encrypt_query_param && voice.media.aes_key) {
      try {
        const silkBuf = await downloadAndDecrypt(
          voice.media.encrypt_query_param,
          voice.media.aes_key,
        );
        const wavBuf = await silkToWav(silkBuf);
        if (wavBuf) {
          log("voice decoded from SILK to WAV (%d bytes)", wavBuf.length);
        }
        // We can't send WAV to a session easily, so just log
        // Voice STT is the primary path
      } catch (err) {
        log("voice download failed: %O", err);
      }
    }
  }

  return {};
}
