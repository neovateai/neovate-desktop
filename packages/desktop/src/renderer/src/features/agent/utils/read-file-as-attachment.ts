import type { ImageAttachment } from "../../../../../shared/features/agent/types";

export function readFileAsAttachment(file: File): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve({
        id: crypto.randomUUID(),
        filename: file.name || "image",
        mediaType: file.type || "image/png",
        base64: dataUrl.split(",")[1],
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
