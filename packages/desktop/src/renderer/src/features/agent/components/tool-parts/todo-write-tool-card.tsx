import type { DynamicToolPart } from "../../../../../../shared/features/agent/types";

import { Tool, ToolContent, ToolHeader } from "../../../../components/ai-elements/tool";

type TodoItem = {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
};

type Props = { part: DynamicToolPart };

/** Renders a TodoWrite tool invocation card for managing task lists. */
export function TodoWriteToolCard({ part }: Props) {
  const input = part.input as { todos?: TodoItem[] };
  const todos = input.todos ?? [];

  return (
    <Tool defaultOpen={part.state !== "output-available"}>
      <ToolHeader title="Todo Write" type="dynamic-tool" toolName="TodoWrite" state={part.state} />
      <ToolContent>
        {/* Show todos as structured list */}
        {todos.length > 0 && (
          <div className="space-y-1 mb-3">
            {todos.map((todo, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-2 text-sm ${
                  todo.status === "completed"
                    ? "text-muted-foreground line-through"
                    : todo.status === "in_progress"
                      ? "text-foreground font-medium"
                      : "text-muted-foreground"
                }`}
              >
                <span className="shrink-0">
                  {todo.status === "completed" && "✓"}
                  {todo.status === "in_progress" && "→"}
                  {todo.status === "pending" && "○"}
                </span>
                <span>{todo.activeForm ?? todo.content}</span>
              </div>
            ))}
          </div>
        )}
      </ToolContent>
    </Tool>
  );
}
