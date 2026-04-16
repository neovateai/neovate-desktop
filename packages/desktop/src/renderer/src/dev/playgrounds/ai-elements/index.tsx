import { useState } from "react";

import { ScrollArea } from "../../../components/ui/scroll-area";
import { cn } from "../../../lib/utils";
import { ChatPlayground } from "./chat-playground";
import { SidebarButton, SidebarGroupLabel } from "./common";
import { AgentToolPlayground } from "./tools/agent-tool-playground";
import { AskUserQuestionToolPlayground } from "./tools/ask-user-question-tool-playground";
import { BashOutputToolPlayground } from "./tools/bash-output-tool-playground";
import { BashToolPlayground } from "./tools/bash-tool-playground";
import { EditToolPlayground } from "./tools/edit-tool-playground";
import { EnterPlanModeToolPlayground } from "./tools/enter-plan-mode-tool-playground";
import { EnterWorktreeToolPlayground } from "./tools/enter-worktree-tool-playground";
import { ExitPlanModeToolPlayground } from "./tools/exit-plan-mode-tool-playground";
import { GlobToolPlayground } from "./tools/glob-tool-playground";
import { GrepToolPlayground } from "./tools/grep-tool-playground";
import { MultiEditToolPlayground } from "./tools/multi-edit-tool-playground";
import { NotebookEditToolPlayground } from "./tools/notebook-edit-tool-playground";
import { ReadToolPlayground } from "./tools/read-tool-playground";
import { SkillToolPlayground } from "./tools/skill-tool-playground";
import { SlashCommandToolPlayground } from "./tools/slash-command-tool-playground";
import { TaskOutputToolPlayground } from "./tools/task-output-tool-playground";
import { TaskStopToolPlayground } from "./tools/task-stop-tool-playground";
import { TaskToolPlayground } from "./tools/task-tool-playground";
import { TodoWriteToolPlayground } from "./tools/todo-write-tool-playground";
import { ToolPrimitivesPlayground } from "./tools/tool-primitives-playground";
import { WebFetchToolPlayground } from "./tools/web-fetch-tool-playground";
import { WebSearchToolPlayground } from "./tools/web-search-tool-playground";
import { WriteToolPlayground } from "./tools/write-tool-playground";

type SectionId =
  | "chat"
  | "tool-primitives"
  | "agent-tool"
  | "task-tool"
  | "ask-user-question-tool"
  | "bash-tool"
  | "bash-output-tool"
  | "edit-tool"
  | "enter-plan-mode-tool"
  | "enter-worktree-tool"
  | "exit-plan-mode-tool"
  | "glob-tool"
  | "grep-tool"
  | "multi-edit-tool"
  | "notebook-edit-tool"
  | "read-tool"
  | "skill-tool"
  | "slash-command-tool"
  | "task-output-tool"
  | "task-stop-tool"
  | "todo-write-tool"
  | "web-fetch-tool"
  | "web-search-tool"
  | "write-tool";

function renderSection(section: SectionId) {
  switch (section) {
    case "chat":
      return <ChatPlayground />;
    case "tool-primitives":
      return <ToolPrimitivesPlayground />;
    case "agent-tool":
      return <AgentToolPlayground />;
    case "task-tool":
      return <TaskToolPlayground />;
    case "ask-user-question-tool":
      return <AskUserQuestionToolPlayground />;
    case "bash-tool":
      return <BashToolPlayground />;
    case "bash-output-tool":
      return <BashOutputToolPlayground />;
    case "edit-tool":
      return <EditToolPlayground />;
    case "enter-plan-mode-tool":
      return <EnterPlanModeToolPlayground />;
    case "enter-worktree-tool":
      return <EnterWorktreeToolPlayground />;
    case "exit-plan-mode-tool":
      return <ExitPlanModeToolPlayground />;
    case "glob-tool":
      return <GlobToolPlayground />;
    case "grep-tool":
      return <GrepToolPlayground />;
    case "multi-edit-tool":
      return <MultiEditToolPlayground />;
    case "notebook-edit-tool":
      return <NotebookEditToolPlayground />;
    case "read-tool":
      return <ReadToolPlayground />;
    case "skill-tool":
      return <SkillToolPlayground />;
    case "slash-command-tool":
      return <SlashCommandToolPlayground />;
    case "task-output-tool":
      return <TaskOutputToolPlayground />;
    case "task-stop-tool":
      return <TaskStopToolPlayground />;
    case "todo-write-tool":
      return <TodoWriteToolPlayground />;
    case "web-fetch-tool":
      return <WebFetchToolPlayground />;
    case "web-search-tool":
      return <WebSearchToolPlayground />;
    case "write-tool":
      return <WriteToolPlayground />;
  }
}

export default function AiElementsPlayground() {
  const [section, setSection] = useState<SectionId>("tool-primitives");

  return (
    <div className="flex h-full min-h-0">
      <aside className="flex w-80 shrink-0 flex-col border-r bg-muted/20">
        <div className="border-b px-4 py-4">
          <h1 className="text-sm font-semibold">AI Elements</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Chat and tool renderer playground with scenario switching.
          </p>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-1 p-2">
            <SidebarGroupLabel>Chat</SidebarGroupLabel>
            <SidebarButton active={section === "chat"} onClick={() => setSection("chat")}>
              Chat
            </SidebarButton>

            <SidebarGroupLabel>Primitives</SidebarGroupLabel>
            <SidebarButton
              active={section === "tool-primitives"}
              onClick={() => setSection("tool-primitives")}
            >
              Tool Primitives
            </SidebarButton>

            <SidebarGroupLabel>Tools</SidebarGroupLabel>
            <SidebarButton
              active={section === "agent-tool"}
              onClick={() => setSection("agent-tool")}
            >
              AgentTool
            </SidebarButton>
            <SidebarButton active={section === "task-tool"} onClick={() => setSection("task-tool")}>
              TaskTool
            </SidebarButton>
            <SidebarButton
              active={section === "ask-user-question-tool"}
              onClick={() => setSection("ask-user-question-tool")}
            >
              AskUserQuestionTool
            </SidebarButton>
            <SidebarButton active={section === "bash-tool"} onClick={() => setSection("bash-tool")}>
              BashTool
            </SidebarButton>
            <SidebarButton
              active={section === "bash-output-tool"}
              onClick={() => setSection("bash-output-tool")}
            >
              BashOutputTool
            </SidebarButton>
            <SidebarButton active={section === "edit-tool"} onClick={() => setSection("edit-tool")}>
              EditTool
            </SidebarButton>
            <SidebarButton
              active={section === "enter-plan-mode-tool"}
              onClick={() => setSection("enter-plan-mode-tool")}
            >
              EnterPlanModeTool
            </SidebarButton>
            <SidebarButton
              active={section === "enter-worktree-tool"}
              onClick={() => setSection("enter-worktree-tool")}
            >
              EnterWorktreeTool
            </SidebarButton>
            <SidebarButton
              active={section === "exit-plan-mode-tool"}
              onClick={() => setSection("exit-plan-mode-tool")}
            >
              ExitPlanModeTool
            </SidebarButton>
            <SidebarButton active={section === "glob-tool"} onClick={() => setSection("glob-tool")}>
              GlobTool
            </SidebarButton>
            <SidebarButton active={section === "grep-tool"} onClick={() => setSection("grep-tool")}>
              GrepTool
            </SidebarButton>
            <SidebarButton
              active={section === "multi-edit-tool"}
              onClick={() => setSection("multi-edit-tool")}
            >
              MultiEditTool
            </SidebarButton>
            <SidebarButton
              active={section === "notebook-edit-tool"}
              onClick={() => setSection("notebook-edit-tool")}
            >
              NotebookEditTool
            </SidebarButton>
            <SidebarButton active={section === "read-tool"} onClick={() => setSection("read-tool")}>
              ReadTool
            </SidebarButton>
            <SidebarButton
              active={section === "skill-tool"}
              onClick={() => setSection("skill-tool")}
            >
              SkillTool
            </SidebarButton>
            <SidebarButton
              active={section === "slash-command-tool"}
              onClick={() => setSection("slash-command-tool")}
            >
              SlashCommandTool
            </SidebarButton>
            <SidebarButton
              active={section === "task-output-tool"}
              onClick={() => setSection("task-output-tool")}
            >
              TaskOutputTool
            </SidebarButton>
            <SidebarButton
              active={section === "task-stop-tool"}
              onClick={() => setSection("task-stop-tool")}
            >
              TaskStopTool
            </SidebarButton>
            <SidebarButton
              active={section === "todo-write-tool"}
              onClick={() => setSection("todo-write-tool")}
            >
              TodoWriteTool
            </SidebarButton>
            <SidebarButton
              active={section === "web-fetch-tool"}
              onClick={() => setSection("web-fetch-tool")}
            >
              WebFetchTool
            </SidebarButton>
            <SidebarButton
              active={section === "web-search-tool"}
              onClick={() => setSection("web-search-tool")}
            >
              WebSearchTool
            </SidebarButton>
            <SidebarButton
              active={section === "write-tool"}
              onClick={() => setSection("write-tool")}
            >
              WriteTool
            </SidebarButton>
          </div>
        </ScrollArea>
      </aside>

      <main className={cn("min-w-0 flex-1")}>{renderSection(section)}</main>
    </div>
  );
}
