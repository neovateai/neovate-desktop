import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Extension } from "@tiptap/react";
import debug from "debug";

import type { ImageAttachment } from "../../../../../shared/features/agent/types";

import { readFileAsAttachment } from "../utils/read-file-as-attachment";

const log = debug("neovate:image-paste");

type ImagePasteOptions = {
  onImages: (images: ImageAttachment[]) => void;
};

function extractImageFiles(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];
  log(
    "extractImageFiles: files=%d items=%d types=%o",
    dataTransfer.files.length,
    dataTransfer.items?.length ?? 0,
    dataTransfer.types,
  );
  for (let i = 0; i < dataTransfer.files.length; i++) {
    const file = dataTransfer.files[i];
    log("extractImageFiles: file[%d] name=%s type=%s size=%d", i, file.name, file.type, file.size);
    if (file.type.startsWith("image/")) {
      files.push(file);
    }
  }
  // Also check items for clipboard paste (some browsers put images in items, not files)
  if (files.length === 0 && dataTransfer.items) {
    for (let i = 0; i < dataTransfer.items.length; i++) {
      const item = dataTransfer.items[i];
      log("extractImageFiles: item[%d] kind=%s type=%s", i, item.kind, item.type);
      if (item.kind === "file" && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) {
          log("extractImageFiles: item[%d] -> file name=%s size=%d", i, file.name, file.size);
          files.push(file);
        }
      }
    }
  }
  log("extractImageFiles: result count=%d", files.length);
  return files;
}

export function createImagePasteExtension(onImages: (images: ImageAttachment[]) => void) {
  return Extension.create<ImagePasteOptions>({
    name: "imagePaste",

    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("imagePaste"),
          props: {
            handlePaste(_view, event) {
              log("handlePaste: triggered");
              const clipboardData = event.clipboardData;
              if (!clipboardData) {
                log("handlePaste: no clipboardData");
                return false;
              }

              const imageFiles = extractImageFiles(clipboardData);
              if (imageFiles.length === 0) {
                log("handlePaste: no image files found");
                return false;
              }

              log("handlePaste: found %d images, preventing default", imageFiles.length);
              event.preventDefault();
              Promise.all(imageFiles.map(readFileAsAttachment)).then((attachments) => {
                log(
                  "handlePaste: resolved %d attachments, ids=%o",
                  attachments.length,
                  attachments.map((a) => a.id),
                );
                onImages(attachments);
              });
              return true;
            },

            handleDrop(_view, event) {
              log("handleDrop: triggered");
              const dataTransfer = (event as DragEvent).dataTransfer;
              if (!dataTransfer) {
                log("handleDrop: no dataTransfer");
                return false;
              }

              const imageFiles = extractImageFiles(dataTransfer);
              if (imageFiles.length === 0) {
                log("handleDrop: no image files found");
                return false;
              }

              log("handleDrop: found %d images, preventing default", imageFiles.length);
              event.preventDefault();
              Promise.all(imageFiles.map(readFileAsAttachment)).then((attachments) => {
                log(
                  "handleDrop: resolved %d attachments, ids=%o",
                  attachments.length,
                  attachments.map((a) => a.id),
                );
                onImages(attachments);
              });
              return true;
            },
          },
        }),
      ];
    },
  });
}
