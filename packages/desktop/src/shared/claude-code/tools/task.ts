import type { UIToolInvocation } from "ai";

import { Agent, type AgentUIToolInvocation } from "./agent";

// Claude Agent SDK still accepts `Task` as an alias of `Agent`.
export const Task = Agent;

export type TaskUIToolInvocation = UIToolInvocation<typeof Task>;
export type { AgentUIToolInvocation };
