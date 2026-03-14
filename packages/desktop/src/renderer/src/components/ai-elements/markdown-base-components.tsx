import type { ComponentProps } from "react";
import type { Components, ExtraProps } from "streamdown";

import { cn } from "../../lib/utils";

type MarkdownAnchorProps = ComponentProps<"a"> & ExtraProps;
type MarkdownBlockquoteProps = ComponentProps<"blockquote"> & ExtraProps;
type MarkdownCodeProps = ComponentProps<"code"> & ExtraProps;
type MarkdownImageProps = ComponentProps<"img"> & ExtraProps;
type MarkdownInputProps = ComponentProps<"input"> & ExtraProps;
type MarkdownPreProps = ComponentProps<"pre"> & ExtraProps;
type MarkdownTableProps = ComponentProps<"table"> & ExtraProps;

const isBlockCode = (className?: string) =>
  className?.split(" ").some((token) => token.startsWith("language-")) ?? false;

function MarkdownLink({ className, children, ...props }: MarkdownAnchorProps) {
  return (
    <a
      className={cn(
        "text-primary font-medium underline underline-offset-2 decoration-primary/30 hover:decoration-primary transition-colors",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}

function MarkdownInlineCode({ className, children, ...props }: MarkdownCodeProps) {
  if (isBlockCode(className)) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  return (
    <code
      className={cn(
        "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.8125rem] leading-none align-baseline",
        className,
      )}
      {...props}
    >
      {children}
    </code>
  );
}

function MarkdownPre({ className, children, ...props }: MarkdownPreProps) {
  return (
    <pre className={cn("my-3 overflow-x-auto first:mt-0 last:mb-0", className)} {...props}>
      {children}
    </pre>
  );
}

function MarkdownBlockquote({ className, children, ...props }: MarkdownBlockquoteProps) {
  return (
    <blockquote
      className={cn(
        "my-3 border-l-2 border-primary/20 pl-3 py-0.5 italic text-muted-foreground bg-muted/30 rounded-r-md pr-3 first:mt-0 last:mb-0",
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
    <div
      className="my-3 overflow-x-auto overflow-hidden rounded-lg border border-border/50 first:mt-0 last:mb-0"
      data-markdown-table-wrapper="true"
    >
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
      className={cn(
        "my-3 max-w-full h-auto rounded-lg border border-border/50 first:mt-0 last:mb-0",
        className,
      )}
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
    <p className={cn("my-3 text-sm leading-6 first:mt-0 last:mb-0", className)} {...props}>
      {children}
    </p>
  ),
  h1: ({ className, children, ...props }) => (
    <h1
      className={cn(
        "mt-6 mb-3 text-lg font-semibold leading-tight text-foreground first:mt-0",
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
        "mt-5 mb-2.5 text-base font-semibold leading-tight text-foreground first:mt-0",
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
        "mt-4 mb-2 text-sm font-semibold leading-tight text-foreground first:mt-0",
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
        "mt-3 mb-2 text-sm font-medium leading-tight text-muted-foreground first:mt-0",
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
    <ul
      className={cn(
        "my-3 list-none space-y-1.5 pl-0 first:mt-0 last:mb-0 [&_ul]:my-1.5 [&_ul]:ml-4 [&_ol]:my-1.5 [&_ol]:ml-4",
        className,
      )}
      {...props}
    >
      {children}
    </ul>
  ),
  ol: ({ className, children, ...props }) => (
    <ol
      className={cn(
        "my-3 list-none space-y-1.5 pl-0 first:mt-0 last:mb-0 [&_ul]:my-1.5 [&_ul]:ml-4 [&_ol]:my-1.5 [&_ol]:ml-4",
        "[counter-reset:list-item]",
        className,
      )}
      {...props}
    >
      {children}
    </ol>
  ),
  li: ({ className, children, ...props }) => (
    <li
      className={cn(
        "flex items-baseline gap-2 text-sm leading-6",
        // Unordered list bullet - use inline-flex for baseline alignment
        "[ul>&]:before:content-['•'] [ul>&]:before:text-muted-foreground/60",
        "[ul>&]:before:text-[0.5rem] [ul>&]:before:leading-6 [ul>&]:before:shrink-0",
        // Ordered list number
        "[ol>&]:before:content-[counter(list-item)'.'] [ol>&]:before:[counter-increment:list-item]",
        "[ol>&]:before:text-xs [ol>&]:before:leading-6 [ol>&]:before:text-muted-foreground/70",
        "[ol>&]:before:min-w-[1.25rem] [ol>&]:before:text-right [ol>&]:before:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
    </li>
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn("my-4 border-0 h-px bg-border/60 first:mt-0 last:mb-0", className)}
      {...props}
    />
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
    <thead className={cn("bg-muted/50", className)} {...props}>
      {children}
    </thead>
  ),
  tbody: ({ className, children, ...props }) => (
    <tbody className={className} {...props}>
      {children}
    </tbody>
  ),
  tr: ({ className, children, ...props }) => (
    <tr className={cn("[&:last-child>td]:border-b-0", className)} {...props}>
      {children}
    </tr>
  ),
  th: ({ className, children, ...props }) => (
    <th
      className={cn(
        "border-b border-border/50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground align-bottom",
        className,
      )}
      {...props}
    >
      {children}
    </th>
  ),
  td: ({ className, children, ...props }) => (
    <td
      className={cn(
        "border-b border-border/30 px-3 py-2 text-sm text-foreground align-top",
        className,
      )}
      {...props}
    >
      {children}
    </td>
  ),
  img: MarkdownImage,
  input: MarkdownInput,
};
