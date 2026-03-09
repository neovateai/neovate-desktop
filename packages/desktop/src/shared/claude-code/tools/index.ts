import type { InferUITools, ToolSet } from "ai";

export { Bash, type BashUIToolInvocation } from "./bash";
export { Agent, type AgentUIToolInvocation } from "./agent";
export { Task, type TaskUIToolInvocation } from "./task";
export { TaskOutput, type TaskOutputUIToolInvocation } from "./task-output";
export { TaskStop, type TaskStopUIToolInvocation } from "./task-stop";
export { Read, type ReadUIToolInvocation } from "./read";
export { Edit, type EditUIToolInvocation } from "./edit";
export { MultiEdit, type MultiEditUIToolInvocation } from "./multi-edit";
export { Write, type WriteUIToolInvocation } from "./write";
export { Glob, type GlobUIToolInvocation } from "./glob";
export { Grep, type GrepUIToolInvocation } from "./grep";
export { WebFetch, type WebFetchUIToolInvocation } from "./web-fetch";
export { WebSearch, type WebSearchUIToolInvocation } from "./web-search";
export { TodoWrite, type TodoWriteUIToolInvocation } from "./todo-write";
export { BashOutput, type BashOutputUIToolInvocation } from "./bash-output";
export { SlashCommand, type SlashCommandUIToolInvocation } from "./slash-command";
export { ExitPlanMode, type ExitPlanModeUIToolInvocation } from "./exit-plan-mode";
export { NotebookEdit, type NotebookEditUIToolInvocation } from "./notebook-edit";
export { AskUserQuestion, type AskUserQuestionUIToolInvocation } from "./ask-user-question";
export { Skill, type SkillUIToolInvocation } from "./skill";
export { EnterPlanMode, type EnterPlanModeUIToolInvocation } from "./enter-plan-mode";
export { EnterWorktree, type EnterWorktreeUIToolInvocation } from "./enter-worktree";

// Re-import for registry object
import { Bash } from "./bash";
import { Agent } from "./agent";
import { Task } from "./task";
import { TaskOutput } from "./task-output";
import { TaskStop } from "./task-stop";
import { Read } from "./read";
import { Edit } from "./edit";
import { MultiEdit } from "./multi-edit";
import { Write } from "./write";
import { Glob } from "./glob";
import { Grep } from "./grep";
import { WebFetch } from "./web-fetch";
import { WebSearch } from "./web-search";
import { TodoWrite } from "./todo-write";
import { BashOutput } from "./bash-output";
import { SlashCommand } from "./slash-command";
import { ExitPlanMode } from "./exit-plan-mode";
import { NotebookEdit } from "./notebook-edit";
import { AskUserQuestion } from "./ask-user-question";
import { Skill } from "./skill";
import { EnterPlanMode } from "./enter-plan-mode";
import { EnterWorktree } from "./enter-worktree";

/**
 * Registry of all Claude Code tools with Zod schemas.
 *
 * Each tool uses `type: "provider-defined"` — they are executed on the
 * Claude Code process side, never by the client.
 */
export const toolSet = {
  Bash,
  Agent,
  Task,
  TaskOutput,
  TaskStop,
  Read,
  Edit,
  MultiEdit,
  Write,
  Glob,
  Grep,
  WebFetch,
  WebSearch,
  TodoWrite,
  BashOutput,
  SlashCommand,
  ExitPlanMode,
  NotebookEdit,
  AskUserQuestion,
  Skill,
  EnterPlanMode,
  EnterWorktree,
} satisfies ToolSet;

/**
 * Inferred UI tool types for all Claude Code tools.
 *
 * Flows into `UIMessage<unknown, UIDataTypes, ClaudeCodeTools>` so that
 * `message.parts` are fully typed and narrowable via `part.type`.
 *
 * Example discriminated union members:
 * - `"tool-Bash"` → `BashUIToolInvocation`
 * - `"tool-Task"` → `TaskUIToolInvocation`
 * - `"tool-Read"` → `ReadUIToolInvocation`
 * - etc.
 */
export type ClaudeCodeUITools = InferUITools<typeof toolSet>;
