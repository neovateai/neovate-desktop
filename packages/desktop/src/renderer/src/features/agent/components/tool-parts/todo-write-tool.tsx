import type { TodoWriteUIToolInvocation } from "../../../../../../shared/claude-code/types";

import { cn } from "../../../../lib/utils";
import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";
import { SquareCheckIcon, SquareDotIcon, SquareIcon } from "lucide-react";

export function TodoWriteTool({ invocation }: { invocation: TodoWriteUIToolInvocation }) {
  if (!invocation || invocation.state === "input-streaming") return null;
  const { state, input } = invocation;

  const count = input?.todos?.length ?? 0;
  const title = `Todo (${count} tasks)`;

  return (
    <Tool>
      <ToolHeader type="tool-TodoWrite" state={state} title={title} />
      <ToolContent>
        {input?.todos && input.todos.length > 0 ? (
          <div className="space-y-2">
            {input.todos.map((todo, index) => (
              <div key={`${index}-${todo.content}`} className="flex items-start gap-3">
                {todo.status === "completed" && (
                  <SquareCheckIcon className="mt-0.5 size-4 shrink-0" />
                )}
                {todo.status === "in_progress" && (
                  <SquareDotIcon className="mt-0.5 size-4 shrink-0" />
                )}
                {todo.status === "pending" && <SquareIcon className="mt-0.5 size-4 shrink-0" />}
                <p
                  className={cn(
                    "min-w-0 flex-1 text-sm",
                    todo.status === "completed" && "text-muted-foreground line-through",
                  )}
                >
                  {todo.status === "in_progress" ? todo.activeForm : todo.content}
                </p>
              </div>
            ))}
          </div>
        ) : null}
      </ToolContent>
    </Tool>
  );
}
