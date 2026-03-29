import type { ComponentProps, ReactNode } from "react";
import type { Components, ExtraProps } from "streamdown";

import { isValidElement, useMemo } from "react";

import { markdownBaseComponents } from "../../../components/ai-elements/markdown-base-components";
import { useRendererApp } from "../../../core/app";
import { parseFilePath } from "../../../lib/filepath";
import { cn } from "../../../lib/utils";

const extractTextContent = (children: ReactNode): string => {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(extractTextContent).join("");
  if (isValidElement(children)) {
    const props = children.props as { children?: ReactNode };
    if (props.children) return extractTextContent(props.children);
  }
  return "";
};

type InlineCodeProps = ComponentProps<"code"> & ExtraProps;

type FilePathClickHandler = (path: string, line?: number, col?: number) => void;

function createFilePathCode(onFilePathClick: FilePathClickHandler) {
  return ({ children, className, node, ...props }: InlineCodeProps) => {
    const raw = extractTextContent(children);
    const text = raw.replace(/^`+|`+$/g, "");
    const FallbackCode = markdownBaseComponents.code;

    const fileInfo = parseFilePath(text);

    if (!fileInfo) {
      if (FallbackCode && typeof FallbackCode !== "string") {
        return (
          <FallbackCode className={className} node={node} {...props}>
            {children}
          </FallbackCode>
        );
      }
      return (
        <code className={className} {...props}>
          {children}
        </code>
      );
    }

    const suffix =
      fileInfo.line != null
        ? fileInfo.col != null
          ? `:${fileInfo.line}:${fileInfo.col}`
          : `:${fileInfo.line}`
        : "";

    return (
      <button
        aria-label={`Open ${fileInfo.path}${suffix}`}
        className={cn(
          "inline-block rounded-md bg-muted/50 px-1.5 py-0.5 text-xs align-middle text-info cursor-pointer transition-colors hover:text-info-foreground hover:underline",
          className,
        )}
        data-md="filepath"
        data-filepath={fileInfo.path}
        onClick={() => onFilePathClick(fileInfo.path, fileInfo.line, fileInfo.col)}
        type="button"
      >
        {fileInfo.path}
        {suffix && <span className="opacity-70">{suffix}</span>}
      </button>
    );
  };
}

export function useMarkdownComponents(): Components {
  const app = useRendererApp();

  return useMemo(
    () => ({
      ...markdownBaseComponents,
      code: createFilePathCode((path, line, col) => {
        const resolved = path.startsWith("~/") ? path.replace(/^~/, window.api.homedir) : path;
        const suffix = line != null ? (col != null ? `:${line}:${col}` : `:${line}`) : "";
        app.opener.open(`${resolved}${suffix}`);
      }),
      a: ({ className, children, node: _, ...props }: React.ComponentProps<"a"> & ExtraProps) => (
        <a
          className={cn(
            "text-primary transition-colors underline-offset-2 hover:underline",
            className,
          )}
          {...props}
          onClick={(e) => {
            if (props.href) {
              e.preventDefault();
              app.opener.open(props.href).then((handled) => {
                if (!handled) window.open(props.href);
              });
            }
          }}
        >
          {children}
        </a>
      ),
    }),
    [app.opener],
  );
}
