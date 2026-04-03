import type { TaskState } from "../store";

type Props = {
  tasks?: Map<string, TaskState>;
};

export function TaskProgress({ tasks }: Props) {
  if (!tasks) return null;
  const activeTasks = Array.from(tasks.values()).filter((t) => t.status === "running");

  if (activeTasks.length === 0) return null;

  return (
    <div className="flex flex-col gap-1 border-t border-border px-4 py-2">
      {activeTasks.map((task) => (
        <div key={task.taskId} className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-yellow-500" />
          {task.taskType && (
            <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-medium">
              {task.taskType}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate">{task.description}</span>
          {task.lastToolName && (
            <span className="shrink-0 text-muted-foreground/60">{task.lastToolName}</span>
          )}
          {task.toolUses != null && task.toolUses > 0 && (
            <span className="shrink-0 text-muted-foreground/60">
              {task.toolUses} tool{task.toolUses !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
