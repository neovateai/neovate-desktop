import type { ComponentProps, ReactNode } from "react";
import type { BundledLanguage } from "shiki";
import type { Components, ExtraProps } from "streamdown";

import { Children, isValidElement } from "react";

import { cn } from "../../lib/utils";
import { CodeBlock } from "./code-block";

type MarkdownAnchorProps = ComponentProps<"a"> & ExtraProps;
type MarkdownBlockquoteProps = ComponentProps<"blockquote"> & ExtraProps;
type MarkdownCodeProps = ComponentProps<"code"> & ExtraProps;
type MarkdownImageProps = ComponentProps<"img"> & ExtraProps;
type MarkdownInputProps = ComponentProps<"input"> & ExtraProps;
type MarkdownPreProps = ComponentProps<"pre"> & ExtraProps;
type MarkdownTableProps = ComponentProps<"table"> & ExtraProps;

const isBlockCode = (className?: string) =>
  className?.split(" ").some((token) => token.startsWith("language-")) ?? false;

const extractLanguage = (className?: string): BundledLanguage | null => {
  if (!className) return null;
  const langClass = className.split(" ").find((token) => token.startsWith("language-"));
  if (!langClass) return null;
  const lang = langClass.replace("language-", "");
  // Return as BundledLanguage, shiki will fallback to "text" if not supported
  return lang as BundledLanguage;
};

const extractCodeContent = (children: ReactNode): string => {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) {
    return children.map(extractCodeContent).join("");
  }
  if (isValidElement(children)) {
    const props = children.props as { children?: ReactNode };
    if (props.children) {
      return extractCodeContent(props.children);
    }
  }
  return "";
};

function MarkdownLink({ className, children, ...props }: MarkdownAnchorProps) {
  return (
    <a
      className={cn("text-primary transition-colors underline-offset-2 hover:underline", className)}
      {...props}
    >
      {children}
    </a>
  );
}

function MarkdownInlineCode({ className, children, ...props }: MarkdownCodeProps) {
  const codeContent = typeof children === "string" ? children : extractCodeContent(children);

  // Block code is handled by MarkdownPre, so just render a plain code element here
  if (!isBlockCode(className)) {
    return (
      <code
        className={cn(
          "inline-block rounded-md bg-muted/50 px-1.5 py-0.5 text-xs align-middle",
          className,
        )}
        {...props}
      >
        {children}
      </code>
    );
  }

  // Inline code rendering with syntax highlighting
  const language = extractLanguage(className) ?? ("text" as BundledLanguage);

  return (
    <CodeBlock
      className={cn(
        "inline-block rounded-md bg-muted/50 px-1.5 py-0.5 text-xs align-middle",
        className,
      )}
      code={codeContent}
      language={language}
    />
  );
}

function MarkdownPre({ className, children }: MarkdownPreProps) {
  // Extract code content and language from children
  const codeElement = Children.toArray(children).find(
    (child) => isValidElement(child) && child.type === "code",
  );

  if (isValidElement(codeElement)) {
    const codeProps = codeElement.props as { className?: string; children?: ReactNode };
    const codeClassName = codeProps.className;
    const language = extractLanguage(codeClassName) ?? ("text" as BundledLanguage);
    const codeContent = extractCodeContent(codeProps.children);

    return (
      <CodeBlock
        className={cn("my-4 first:mt-0 last:mb-0", className)}
        code={codeContent}
        language={language}
      />
    );
  }

  // Fallback for non-code pre elements
  return (
    <pre className={cn("my-4 overflow-x-auto first:mt-0 last:mb-0", className)}>{children}</pre>
  );
}

function MarkdownBlockquote({ className, children, ...props }: MarkdownBlockquoteProps) {
  return (
    <blockquote
      className={cn(
        "my-4 pl-4 text-sm italic text-muted-foreground first:mt-0 last:mb-0",
        className,
      )}
      {...props}
    >
      {children}
    </blockquote>
  );
}

function MarkdownTable({ className, children, ...props }: MarkdownTableProps) {
  return (
    <div className="my-4 overflow-x-auto first:mt-0 last:mb-0" data-markdown-table-wrapper="true">
      <table className={cn("w-full border-collapse text-sm", className)} {...props}>
        {children}
      </table>
    </div>
  );
}

function MarkdownImage({ className, alt, ...props }: MarkdownImageProps) {
  return (
    <img
      alt={alt}
      className={cn("my-4 max-w-full rounded-md first:mt-0 last:mb-0", className)}
      loading="lazy"
      {...props}
    />
  );
}

function MarkdownInput({ className, type, ...props }: MarkdownInputProps) {
  if (type !== "checkbox") {
    return <input className={className} type={type} {...props} />;
  }

  return (
    <input
      className={cn(
        "mr-2 inline-block size-3.5 rounded border-border align-middle accent-primary",
        className,
      )}
      type="checkbox"
      {...props}
    />
  );
}

export const markdownBaseComponents: Components = {
  p: ({ className, children, ...props }) => (
    <p className={cn("my-4 text-sm leading-relaxed first:mt-0 last:mb-0", className)} {...props}>
      {children}
    </p>
  ),
  h1: ({ className, children, ...props }) => (
    <h1
      className={cn(
        "mt-6 mb-4 text-base font-semibold leading-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ className, children, ...props }) => (
    <h2
      className={cn(
        "mt-5 mb-3 text-sm font-semibold leading-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    >
      {children}
    </h2>
  ),
  h3: ({ className, children, ...props }) => (
    <h3
      className={cn(
        "mt-4 mb-2 text-sm font-medium leading-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    >
      {children}
    </h3>
  ),
  h4: ({ className, children, ...props }) => (
    <h4
      className={cn(
        "mt-4 mb-2 text-sm font-medium leading-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    >
      {children}
    </h4>
  ),
  h5: ({ className, children, ...props }) => (
    <h5
      className={cn(
        "mt-3 mb-2 text-sm font-medium leading-tight text-foreground first:mt-0",
        className,
      )}
      {...props}
    >
      {children}
    </h5>
  ),
  h6: ({ className, children, ...props }) => (
    <h6
      className={cn(
        "mt-3 mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground first:mt-0",
        className,
      )}
      {...props}
    >
      {children}
    </h6>
  ),
  ul: ({ className, children, ...props }) => (
    <ul className={cn("my-4 list-disc space-y-1 pl-5 first:mt-0 last:mb-0", className)} {...props}>
      {children}
    </ul>
  ),
  ol: ({ className, children, ...props }) => (
    <ol
      className={cn("my-4 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0", className)}
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ className, children, ...props }) => (
    <li
      className={cn("text-sm leading-relaxed marker:text-muted-foreground", className)}
      {...props}
    >
      {children}
    </li>
  ),
  hr: ({ className, ...props }) => (
    <hr className={cn("my-6 border-border first:mt-0 last:mb-0", className)} {...props} />
  ),
  strong: ({ className, children, ...props }) => (
    <strong className={cn("font-semibold text-foreground", className)} {...props}>
      {children}
    </strong>
  ),
  em: ({ className, children, ...props }) => (
    <em className={cn("italic", className)} {...props}>
      {children}
    </em>
  ),
  del: ({ className, children, ...props }) => (
    <del className={cn("text-muted-foreground line-through", className)} {...props}>
      {children}
    </del>
  ),
  a: MarkdownLink,
  code: MarkdownInlineCode,
  pre: MarkdownPre,
  blockquote: MarkdownBlockquote,
  table: MarkdownTable,
  thead: ({ className, children, ...props }) => (
    <thead className={cn("bg-muted/40", className)} {...props}>
      {children}
    </thead>
  ),
  tbody: ({ className, children, ...props }) => (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  ),
  tr: ({ className, children, ...props }) => (
    <tr className={cn("align-top", className)} {...props}>
      {children}
    </tr>
  ),
  th: ({ className, children, ...props }) => (
    <th
      className={cn(
        "border-b border-border px-3 py-2 text-left font-medium text-muted-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ className, children, ...props }) => (
    <td className={cn("border-b border-border/50 px-3 py-2", className)} {...props}>
      {children}
    </td>
  ),
  img: MarkdownImage,
  input: MarkdownInput,
};
