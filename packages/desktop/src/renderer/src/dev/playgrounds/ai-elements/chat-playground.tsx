import { useState } from "react";

import type { ClaudeCodeUIMessage } from "../../../../../shared/claude-code/types";

import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "../../../components/ai-elements/conversation";
import { MessageParts } from "../../../features/agent/components/message-parts";
import { ClaudeCodeToolUIPart } from "../../../features/agent/components/tool-parts";
import { demoImageUrl, PlaygroundPage, rendererRoot, ScenarioButton } from "./common";

type Scenario =
  | "assistant-text"
  | "user-text"
  | "reasoning"
  | "image"
  | "mixed"
  | "nested-agent"
  | "conversation";

const assistantTextMessage = {
  id: "chat-assistant-text",
  role: "assistant",
  metadata: { sessionId: "demo-session", parentToolUseId: null },
  parts: [
    {
      type: "text",
      text: "The playground can now render assistant markdown in isolation.",
      state: "done",
    },
  ],
} as any satisfies ClaudeCodeUIMessage;

const userTextMessage = {
  id: "chat-user-text",
  role: "user",
  metadata: { sessionId: "demo-session", parentToolUseId: null },
  parts: [
    {
      type: "text",
      text: "Show me the state of the `ReadTool` before the command finishes.",
      state: "done",
    },
  ],
} as any satisfies ClaudeCodeUIMessage;

const reasoningMessage = {
  id: "chat-reasoning",
  role: "assistant",
  metadata: { sessionId: "demo-session", parentToolUseId: null },
  parts: [
    {
      type: "reasoning",
      text: `I need to inspect the UI renderer hierarchy first.

The state badge belongs to the tool header, while the body decides how much context to reveal.

That means the playground should cover both header-only and content-heavy states.`,
      state: "done",
    },
    {
      type: "text",
      text: "The reasoning renderer is now visible inside chat scenarios.",
      state: "done",
    },
  ],
} as any satisfies ClaudeCodeUIMessage;

const imageMessage = {
  id: "chat-image",
  role: "user",
  metadata: { sessionId: "demo-session", parentToolUseId: null },
  parts: [
    {
      type: "text",
      text: "This screenshot should sit inline with the chat flow.",
      state: "done",
    },
    {
      type: "file",
      mediaType: "image/svg+xml",
      filename: "playground-attachment.svg",
      url: demoImageUrl,
    },
  ],
} as any satisfies ClaudeCodeUIMessage;

const nestedAgentOutput = {
  id: "child-agent-message",
  role: "assistant",
  metadata: { sessionId: "demo-session", parentToolUseId: "agent-tool-call" },
  parts: [
    {
      type: "text",
      text: "I checked the renderer and found the missing state handling.",
      state: "done",
    },
    {
      type: "tool-Read",
      toolCallId: "child-read-tool",
      state: "output-available",
      input: {
        file_path: `${rendererRoot}/features/agent/components/tool-parts/index.tsx`,
        limit: 20,
      },
      output: `1→export function ClaudeCodeToolUIPart({ part }: { part: ToolUIPart<ClaudeCodeUITools> }) {
2→  if (!part) {
3→    return null;
4→  }`,
      providerExecuted: true,
    },
    {
      type: "text",
      text: "The global input-streaming guard has been removed.",
      state: "done",
    },
  ],
} as any satisfies ClaudeCodeUIMessage;

const nestedAgentMessage = {
  id: "chat-nested-agent",
  role: "assistant",
  metadata: { sessionId: "demo-session", parentToolUseId: null },
  parts: [
    {
      type: "tool-Agent",
      toolCallId: "agent-tool-call",
      state: "output-available",
      input: {
        description: "Inspect tool rendering",
        prompt: "Find where input-streaming is hidden in the tool renderer path.",
        subagent_type: "explorer",
      },
      output: nestedAgentOutput,
      providerExecuted: true,
    },
  ],
} as any satisfies ClaudeCodeUIMessage;

const mixedMessage = {
  id: "chat-mixed",
  role: "assistant",
  metadata: { sessionId: "demo-session", parentToolUseId: null },
  parts: [
    {
      type: "text",
      text: "This message mixes text, reasoning, and a tool invocation in one bubble stack.",
      state: "done",
    },
    {
      type: "reasoning",
      text: "The user wants UI debugging coverage, so the message renderer should be composable.",
      state: "done",
    },
    {
      type: "tool-Write",
      toolCallId: "mixed-write-tool",
      state: "output-error",
      input: {
        file_path: `${rendererRoot}/dev/playgrounds/ai-elements/index.tsx`,
        content: "export const title = 'AI Elements';",
      },
      errorText: "Permission denied while writing the demo file.",
      providerExecuted: true,
    },
  ],
} as any satisfies ClaudeCodeUIMessage;

const conversationMessages = [
  userTextMessage,
  {
    id: "conversation-read",
    role: "assistant",
    metadata: { sessionId: "demo-session", parentToolUseId: null },
    parts: [
      {
        type: "text",
        text: "Here is the `ReadTool` before output is available.",
        state: "done",
      },
      {
        type: "tool-Read",
        toolCallId: "conversation-read-tool",
        state: "input-available",
        input: {
          file_path: `${rendererRoot}/features/agent/components/tool-parts/read-tool.tsx`,
          limit: 80,
        },
        providerExecuted: true,
      },
    ],
  },
  {
    id: "conversation-followup",
    role: "assistant",
    metadata: { sessionId: "demo-session", parentToolUseId: null },
    parts: [
      {
        type: "text",
        text: "When the tool finishes, the same renderer expands to show the file body.",
        state: "done",
      },
    ],
  },
] as any satisfies ClaudeCodeUIMessage[];

function renderMessages(messages: ClaudeCodeUIMessage[]) {
  return (
    <div className="h-[32rem]">
      <Conversation className="rounded-2xl border bg-background">
        <ConversationContent>
          {messages.map((message) => (
            <MessageParts
              key={message.id}
              message={message}
              renderToolPart={(_partMessage, part) => <ClaudeCodeToolUIPart part={part} />}
            />
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
    </div>
  );
}

export function ChatPlayground() {
  const [scenario, setScenario] = useState<Scenario>("conversation");

  let messages: ClaudeCodeUIMessage[] = conversationMessages;

  switch (scenario) {
    case "assistant-text":
      messages = [assistantTextMessage];
      break;
    case "user-text":
      messages = [userTextMessage];
      break;
    case "reasoning":
      messages = [reasoningMessage];
      break;
    case "image":
      messages = [imageMessage];
      break;
    case "mixed":
      messages = [mixedMessage];
      break;
    case "nested-agent":
      messages = [nestedAgentMessage];
      break;
    case "conversation":
      messages = conversationMessages;
      break;
  }

  return (
    <PlaygroundPage
      title="Chat"
      summary="Full chat rendering built from Conversation, MessageParts, and ClaudeCodeToolUIPart."
      scenarioLabel={scenario}
      controls={
        <>
          <ScenarioButton
            active={scenario === "assistant-text"}
            onClick={() => setScenario("assistant-text")}
          >
            Assistant Text
          </ScenarioButton>
          <ScenarioButton
            active={scenario === "user-text"}
            onClick={() => setScenario("user-text")}
          >
            User Text
          </ScenarioButton>
          <ScenarioButton
            active={scenario === "reasoning"}
            onClick={() => setScenario("reasoning")}
          >
            Reasoning
          </ScenarioButton>
          <ScenarioButton active={scenario === "image"} onClick={() => setScenario("image")}>
            Image
          </ScenarioButton>
          <ScenarioButton active={scenario === "mixed"} onClick={() => setScenario("mixed")}>
            Mixed Parts
          </ScenarioButton>
          <ScenarioButton
            active={scenario === "nested-agent"}
            onClick={() => setScenario("nested-agent")}
          >
            Nested Agent
          </ScenarioButton>
          <ScenarioButton
            active={scenario === "conversation"}
            onClick={() => setScenario("conversation")}
          >
            Conversation
          </ScenarioButton>
        </>
      }
    >
      {renderMessages(messages)}
    </PlaygroundPage>
  );
}
