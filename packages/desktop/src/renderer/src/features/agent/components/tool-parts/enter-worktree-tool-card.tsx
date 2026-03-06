import type { DynamicToolPart } from "../../../../../../shared/features/agent/types";

import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

type Props = { part: DynamicToolPart };

/** Parses EnterWorktree output string to extract path and branch. */
function parseWorktreeOutput(output: string | null): {
  path?: string;
  branch?: string;
} {
  if (!output || typeof output !== "string") {
    return {};
  }

  // Extract path: "Created worktree at /path/to/worktree on branch ..."
  // or "Created worktree at .claude/worktrees/..."
  const pathMatch = output.match(/Created worktree at\s+([^\s]+)\s+on branch/);
  // Extract branch: "on branch branch-name"
  const branchMatch = output.match(/on branch\s+(\S+)/);

  return {
    path: pathMatch?.[1],
    branch: branchMatch?.[1],
  };
}

/** Renders an EnterWorktree tool invocation card. */
export function EnterWorktreeToolCard({ part }: Props) {
  const isSuccess = part.state === "output-available" && !part.errorText;
  const isError = part.state === "output-error" || part.errorText;

  const { path, branch } = parseWorktreeOutput(
    typeof part.output === "string" ? part.output : null,
  );

  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader
        title="Enter Worktree"
        type="dynamic-tool"
        toolName="EnterWorktree"
        state={part.state}
      />
      <ToolContent>
        {isSuccess ? (
          <div className="space-y-3">
            {/* Success indicator */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-green-500">✓</span>
              <span className="font-medium">已创建 Worktree</span>
            </div>

            {/* Path */}
            {path && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground shrink-0">📁</span>
                <div>
                  <span className="text-muted-foreground">路径: </span>
                  <code className="bg-muted px-1 rounded text-xs break-all">{path}</code>
                </div>
              </div>
            )}

            {/* Branch */}
            {branch && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">🌿</span>
                <div>
                  <span className="text-muted-foreground">分支: </span>
                  <code className="bg-muted px-1 rounded">{branch}</code>
                </div>
              </div>
            )}

            {/* Hint */}
            <div className="flex items-start gap-2 text-xs text-muted-foreground mt-2 pt-2 border-t">
              <span>💡</span>
              <span>会话结束时将提示您保留或删除此 Worktree</span>
            </div>
          </div>
        ) : isError ? (
          <div className="space-y-3">
            {/* Error indicator */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-red-500">✗</span>
              <span className="font-medium">创建失败</span>
            </div>

            {/* Error message */}
            {part.errorText && (
              <div className="flex items-start gap-2 text-sm">
                <span className="text-muted-foreground shrink-0">❌</span>
                <span className="text-muted-foreground">{part.errorText}</span>
              </div>
            )}
          </div>
        ) : (
          // Pending state
          <div className="text-sm text-muted-foreground">正在创建 Worktree...</div>
        )}
      </ToolContent>
    </Tool>
  );
}
