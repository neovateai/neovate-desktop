import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";

import type { ImageAttachment } from "../../../../../shared/features/agent/types";

type Props = {
  attachments: ImageAttachment[];
  onRemove: (id: string) => void;
};

export function AttachmentPreview({ attachments, onRemove }: Props) {
  const { t } = useTranslation();

  if (attachments.length === 0) return null;

  return (
    <div className="flex max-h-[200px] flex-wrap gap-2 overflow-y-auto border-b border-border/50 bg-muted/30 px-3 py-2">
      <AnimatePresence>
        {attachments.map((att) => (
          <motion.div
            key={att.id}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            className="group relative"
          >
            <img
              src={`data:${att.mediaType};base64,${att.base64}`}
              alt={att.filename}
              className="h-20 w-20 rounded-lg object-cover ring-1 ring-border/50"
            />
            <button
              type="button"
              aria-label={t("chat.removeAttachment", { filename: att.filename })}
              className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onRemove(att.id)}
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
