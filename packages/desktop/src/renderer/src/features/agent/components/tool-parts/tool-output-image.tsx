import type { ReadToolOutput } from "../../../../../../shared/claude-code/types";

export function ToolOutputImage({ images }: { images?: ReadToolOutput["images"] }) {
  if (!images?.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {images.map((img, i) => (
        <img
          key={i}
          src={img.url}
          alt={img.filename ?? "Tool output"}
          className="max-h-48 rounded-md"
        />
      ))}
    </div>
  );
}
