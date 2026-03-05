import type { InferUITools, ToolSet } from "ai";

import { Bash } from "./tools/bash";
import { BashOutput } from "./tools/bash-output";
import { Edit } from "./tools/edit";
import { ExitPlanMode } from "./tools/exit-plan-mode";
import { Glob } from "./tools/glob";
import { Grep } from "./tools/grep";
import { KillShell } from "./tools/kill-shell";
import { MultiEdit } from "./tools/multi-edit";
import { NotebookEdit } from "./tools/notebook-edit";
import { Read } from "./tools/read";
import { SlashCommand } from "./tools/slash-command";
import { Task } from "./tools/task";
import { TodoWrite } from "./tools/todo-write";
import { WebFetch } from "./tools/web-fetch";
import { WebSearch } from "./tools/web-search";
import { Write } from "./tools/write";

export { Bash, type BashUIToolInvocation } from "./tools/bash";
export { BashOutput, type BashOutputUIToolInvocation } from "./tools/bash-output";
export { Edit, type EditUIToolInvocation } from "./tools/edit";
export { ExitPlanMode, type ExitPlanModeUIToolInvocation } from "./tools/exit-plan-mode";
export { Glob, type GlobUIToolInvocation } from "./tools/glob";
export { Grep, type GrepUIToolInvocation } from "./tools/grep";
export { KillShell, type KillShellUIToolInvocation } from "./tools/kill-shell";
export { MultiEdit, type MultiEditUIToolInvocation } from "./tools/multi-edit";
export { NotebookEdit, type NotebookEditUIToolInvocation } from "./tools/notebook-edit";
export { Read, type ReadUIToolInvocation } from "./tools/read";
export { SlashCommand, type SlashCommandUIToolInvocation } from "./tools/slash-command";
export { Task, type TaskUIToolInvocation } from "./tools/task";
export { TodoWrite, type TodoWriteUIToolInvocation } from "./tools/todo-write";
export { WebFetch, type WebFetchUIToolInvocation } from "./tools/web-fetch";
export { WebSearch, type WebSearchUIToolInvocation } from "./tools/web-search";
export { Write, type WriteUIToolInvocation } from "./tools/write";

export const claudeCodeTools = {
  Bash,
  Task,
  Glob,
  Grep,
  Read,
  Edit,
  MultiEdit,
  Write,
  NotebookEdit,
  ExitPlanMode,
  WebFetch,
  TodoWrite,
  WebSearch,
  BashOutput,
  /** anthropic doc called KillBash, but it is KillShell */
  KillShell,
  SlashCommand,
} satisfies ToolSet;

export type ClaudeCodeTools = InferUITools<typeof claudeCodeTools>;
