import { X } from "lucide-react";
import type { ImageAttachment } from "../../../../../shared/features/agent/types";

type Props = {
  attachments: ImageAttachment[];
  onRemove: (id: string) => void;
};

export function AttachmentPreview({ attachments, onRemove }: Props) {
  if (attachments.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 border-t border-border/50 px-3 py-2">
      {attachments.map((att) => (
        <div key={att.id} className="attachment-thumb group relative">
          <img
            src={`data:${att.mediaType};base64,${att.base64}`}
            alt={att.filename}
            className="h-14 w-14 rounded-md object-cover"
          />
          <button
            type="button"
            className="absolute -right-1.5 -top-1.5 hidden h-4 w-4 items-center justify-center rounded-full bg-destructive text-destructive-foreground group-hover:flex"
            onClick={() => onRemove(att.id)}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
