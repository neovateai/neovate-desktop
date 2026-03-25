interface ToolOutputImageProps {
  output: unknown;
}

interface ImageBlock {
  type: "image";
  source:
    | {
        type: "base64";
        media_type: string;
        data: string;
      }
    | {
        type: "url";
        url: string;
        media_type?: string;
      };
  filename?: string;
}

export function ToolOutputImage({ output }: ToolOutputImageProps) {
  const imageUrl = extractImageUrl(output);

  if (!imageUrl) return null;

  return <img src={imageUrl} alt="Tool output" className="max-h-48 rounded-md object-cover" />;
}

function extractImageUrl(output: unknown): string | null {
  if (!Array.isArray(output)) return null;

  for (const item of output) {
    if (
      item != null &&
      typeof item === "object" &&
      "type" in item &&
      item.type === "image" &&
      "source" in item &&
      item.source != null
    ) {
      const source = item.source as ImageBlock["source"];
      if (source.type === "base64" && source.data) {
        const mimeType = source.media_type || "image/png";
        return `data:${mimeType};base64,${source.data}`;
      } else if (source.type === "url" && source.url) {
        return source.url;
      }
    }
  }

  return null;
}
