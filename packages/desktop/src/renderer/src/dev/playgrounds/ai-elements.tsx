import { useState } from "react";
import { ScrollArea } from "../../components/ui/scroll-area";

import {
  Agent,
  AgentContent,
  AgentHeader,
  AgentInstructions,
  AgentOutput,
  AgentTool,
  AgentTools,
} from "../../components/ai-elements/agent";
import { Artifact, ArtifactClose, ArtifactHeader } from "../../components/ai-elements/artifact";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "../../components/ai-elements/attachments";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "../../components/ai-elements/chain-of-thought";
import {
  Checkpoint,
  CheckpointIcon,
  CheckpointTrigger,
} from "../../components/ai-elements/checkpoint";
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from "../../components/ai-elements/code-block";
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
} from "../../components/ai-elements/confirmation";
import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextTrigger,
} from "../../components/ai-elements/context";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from "../../components/ai-elements/conversation";
import {
  InlineCitation,
  InlineCitationCard,
  InlineCitationCardBody,
  InlineCitationCardTrigger,
  InlineCitationCarousel,
  InlineCitationCarouselContent,
  InlineCitationCarouselItem,
  InlineCitationQuote,
  InlineCitationSource,
} from "../../components/ai-elements/inline-citation";
import {
  Message,
  MessageActions,
  MessageContent,
  MessageResponse,
} from "../../components/ai-elements/message";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "../../components/ai-elements/plan";
import {
  Queue,
  QueueItem,
  QueueItemContent,
  QueueItemIndicator,
  QueueList,
  QueueSection,
  QueueSectionContent,
  QueueSectionLabel,
  QueueSectionTrigger,
} from "../../components/ai-elements/queue";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "../../components/ai-elements/reasoning";
import { Shimmer } from "../../components/ai-elements/shimmer";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "../../components/ai-elements/sources";
import { Task, TaskContent, TaskItem, TaskTrigger } from "../../components/ai-elements/task";
import {
  Terminal,
  TerminalActions,
  TerminalClearButton,
  TerminalContent,
  TerminalCopyButton,
  TerminalHeader,
  TerminalTitle,
} from "../../components/ai-elements/terminal";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "../../components/ai-elements/tool";

import { Button } from "../../components/ui/button";
import { CheckIcon, CopyIcon, MessageSquareIcon, RefreshCwIcon, XIcon } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
        {title}
      </h2>
      <div className="rounded-lg border border-border p-4">{children}</div>
    </div>
  );
}

const webSearchTool = {
  description: "Search the web for information",
  parameters: {
    jsonSchema: {
      type: "object" as const,
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
};

const agentOutputSchema = `{
  type: "object",
  properties: {
    answer: { type: "string" },
    sources: { type: "array", items: { type: "string" } }
  }
}`;

export default function AiElementsPlayground() {
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const [terminalOutput, setTerminalOutput] = useState(
    "$ bun run dev\n\nStarting development server...\n✓ Ready on http://localhost:5173",
  );

  const confirmationState =
    confirmed === null
      ? ("approval-requested" as const)
      : confirmed
        ? ("approval-responded" as const)
        : ("output-denied" as const);

  const confirmationApproval =
    confirmed === null
      ? { id: "call_123" }
      : confirmed
        ? { id: "call_123", approved: true as const }
        : { id: "call_123", approved: false as const };

  return (
    <ScrollArea className="h-full w-full">
      <div className="flex flex-col gap-6 p-6 max-w-2xl mx-auto">
        <div>
          <h1 className="text-base font-semibold">AI Elements</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            All installed components rendered with sample data
          </p>
        </div>

        <Section title="Shimmer">
          <Shimmer as="p" className="text-sm font-medium" duration={2} spread={3}>
            Generating a response for you…
          </Shimmer>
        </Section>

        <Section title="Message">
          <div className="flex flex-col gap-3">
            <Message from="user">
              <MessageContent>What's the weather in Tokyo?</MessageContent>
            </Message>
            <Message from="assistant">
              <MessageContent>
                <MessageResponse>
                  {`The weather in Tokyo is currently **22°C** with partly cloudy skies. Humidity is at 65%.`}
                </MessageResponse>
              </MessageContent>
              <MessageActions>
                <Button size="icon-sm" variant="ghost" onClick={() => {}}>
                  <CopyIcon size={14} />
                </Button>
                <Button size="icon-sm" variant="ghost" onClick={() => {}}>
                  <RefreshCwIcon size={14} />
                </Button>
              </MessageActions>
            </Message>
          </div>
        </Section>

        <Section title="Conversation (empty state)">
          <div className="h-32 rounded-md border bg-muted/30 overflow-hidden">
            <Conversation className="h-full">
              <ConversationContent>
                <ConversationEmptyState
                  icon={<MessageSquareIcon className="size-5" />}
                  title="Start a conversation"
                />
              </ConversationContent>
            </Conversation>
          </div>
        </Section>

        <Section title="Reasoning">
          <Reasoning defaultOpen={true} isStreaming={false}>
            <ReasoningTrigger />
            <ReasoningContent>
              {`First, I'll break down the problem. The user asked about weather in Tokyo — I need temperature, conditions, and humidity.`}
            </ReasoningContent>
          </Reasoning>
        </Section>

        <Section title="Chain of Thought">
          <ChainOfThought defaultOpen={true}>
            <ChainOfThoughtHeader>Reasoning steps</ChainOfThoughtHeader>
            <ChainOfThoughtContent>
              <ChainOfThoughtStep label="Identify the user intent" />
              <ChainOfThoughtStep label="Fetch weather data for Tokyo" />
              <ChainOfThoughtStep label="Format the response" />
            </ChainOfThoughtContent>
          </ChainOfThought>
        </Section>

        <Section title="Tool">
          <Tool defaultOpen={true}>
            <ToolHeader type="tool-get_weather" state="output-available" />
            <ToolContent>
              <ToolInput input={{ location: "Tokyo", units: "celsius" }} />
              <ToolOutput
                output={{ temperature: 22, condition: "Partly Cloudy", humidity: 65 }}
                errorText={undefined}
              />
            </ToolContent>
          </Tool>
        </Section>

        <Section title="Code Block">
          <CodeBlock
            code={
              "async function getWeather(location: string) {\n  const res = await fetch(`/api/weather?q=${location}`);\n  return res.json();\n}"
            }
            language="typescript"
          >
            <CodeBlockHeader>
              <CodeBlockTitle>weather.ts</CodeBlockTitle>
              <CodeBlockActions>
                <CodeBlockCopyButton />
              </CodeBlockActions>
            </CodeBlockHeader>
          </CodeBlock>
        </Section>

        <Section title="Task">
          <Task defaultOpen={true}>
            <TaskTrigger title="Research weather API options" />
            <TaskContent>
              <TaskItem>Compare OpenWeatherMap vs WeatherAPI</TaskItem>
              <TaskItem>Check rate limits and pricing</TaskItem>
              <TaskItem>Evaluate response formats</TaskItem>
            </TaskContent>
          </Task>
        </Section>

        <Section title="Plan">
          <Plan defaultOpen={true}>
            <PlanHeader>
              <PlanTitle>Add Weather Feature</PlanTitle>
              <PlanDescription>Integrate real-time weather data into the app</PlanDescription>
              <PlanAction>Edit</PlanAction>
              <PlanTrigger />
            </PlanHeader>
            <PlanContent>
              <Task>
                <TaskTrigger title="Step 1: Choose weather API" />
                <TaskContent>
                  <TaskItem>Evaluate providers</TaskItem>
                </TaskContent>
              </Task>
              <Task>
                <TaskTrigger title="Step 2: Implement integration" />
                <TaskContent>
                  <TaskItem>Write fetch utility</TaskItem>
                  <TaskItem>Add error handling</TaskItem>
                </TaskContent>
              </Task>
            </PlanContent>
            <PlanFooter>2 of 2 steps remaining</PlanFooter>
          </Plan>
        </Section>

        <Section title="Queue">
          <Queue>
            <QueueSection defaultOpen={true}>
              <QueueSectionTrigger>
                <QueueSectionLabel label="Pending tasks" count={3} />
              </QueueSectionTrigger>
              <QueueSectionContent>
                <QueueList>
                  <QueueItem>
                    <QueueItemIndicator completed={false} />
                    <QueueItemContent>Fetch Tokyo weather</QueueItemContent>
                  </QueueItem>
                  <QueueItem>
                    <QueueItemIndicator completed={false} />
                    <QueueItemContent>Format response</QueueItemContent>
                  </QueueItem>
                  <QueueItem>
                    <QueueItemIndicator completed={true} />
                    <QueueItemContent completed>Send to user</QueueItemContent>
                  </QueueItem>
                </QueueList>
              </QueueSectionContent>
            </QueueSection>
          </Queue>
        </Section>

        <Section title="Sources">
          <Sources>
            <SourcesTrigger count={2} />
            <SourcesContent>
              <Source href="https://openweathermap.org" title="OpenWeatherMap API" />
              <Source href="https://weatherapi.com" title="WeatherAPI Documentation" />
            </SourcesContent>
          </Sources>
        </Section>

        <Section title="Inline Citation">
          <p className="text-sm">
            Tokyo's average temperature in spring is around 15–20°C{" "}
            <InlineCitation>
              <InlineCitationCard>
                <InlineCitationCardTrigger sources={["https://jma.go.jp"]} />
                <InlineCitationCardBody>
                  <InlineCitationCarousel>
                    <InlineCitationCarouselContent>
                      <InlineCitationCarouselItem>
                        <InlineCitationSource
                          title="Japan Meteorological Agency"
                          url="https://jma.go.jp"
                        />
                        <InlineCitationQuote>
                          Spring temperatures in Tokyo range from 10°C to 20°C.
                        </InlineCitationQuote>
                      </InlineCitationCarouselItem>
                    </InlineCitationCarouselContent>
                  </InlineCitationCarousel>
                </InlineCitationCardBody>
              </InlineCitationCard>
            </InlineCitation>
            .
          </p>
        </Section>

        <Section title="Checkpoint">
          <Checkpoint>
            <CheckpointIcon />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Weather data fetched</span>
              <span className="text-xs text-muted-foreground">Saved 2 minutes ago</span>
            </div>
            <CheckpointTrigger onClick={() => {}}>Restore</CheckpointTrigger>
          </Checkpoint>
        </Section>

        <Section title="Confirmation">
          <Confirmation approval={confirmationApproval} state={confirmationState}>
            <ConfirmationRequest>
              Delete <code className="text-xs bg-muted px-1 rounded">data.json</code>? This cannot
              be undone.
            </ConfirmationRequest>
            <ConfirmationAccepted>
              <span className="flex items-center gap-1.5 text-sm">
                <CheckIcon size={14} /> File deleted
              </span>
            </ConfirmationAccepted>
            <ConfirmationRejected>
              <span className="flex items-center gap-1.5 text-sm">
                <XIcon size={14} /> Cancelled
              </span>
            </ConfirmationRejected>
            <ConfirmationActions>
              <ConfirmationAction variant="outline" onClick={() => setConfirmed(false)}>
                Cancel
              </ConfirmationAction>
              <ConfirmationAction onClick={() => setConfirmed(true)}>Delete</ConfirmationAction>
            </ConfirmationActions>
          </Confirmation>
          {confirmed !== null && (
            <Button className="mt-2" size="sm" variant="outline" onClick={() => setConfirmed(null)}>
              Reset
            </Button>
          )}
        </Section>

        <Section title="Context (Token Usage)">
          <Context
            maxTokens={128000}
            usedTokens={45200}
            usage={{
              inputTokens: 28000,
              outputTokens: 12000,
              totalTokens: 40000,
              inputTokenDetails: { noCacheTokens: 28000, cacheReadTokens: 0, cacheWriteTokens: 0 },
              outputTokenDetails: { reasoningTokens: 0, textTokens: 0 },
            }}
            modelId="anthropic:claude-sonnet-4-5"
          >
            <ContextTrigger />
            <ContextContent>
              <ContextContentHeader />
              <ContextContentBody>
                <ContextInputUsage />
                <ContextOutputUsage />
              </ContextContentBody>
            </ContextContent>
          </Context>
        </Section>

        <Section title="Agent">
          <Agent>
            <AgentHeader name="Research Assistant" model="anthropic/claude-sonnet-4-5" />
            <AgentContent>
              <AgentInstructions>
                You are a helpful research assistant. Search the web to answer questions accurately.
              </AgentInstructions>
              <AgentTools>
                <AgentTool value="web_search" tool={webSearchTool as any} />
              </AgentTools>
              <AgentOutput schema={agentOutputSchema} />
            </AgentContent>
          </Agent>
        </Section>

        <Section title="Artifact">
          <Artifact>
            <ArtifactHeader>
              <div className="flex-1">
                <div className="text-sm font-medium">weather-widget.tsx</div>
                <div className="text-xs text-muted-foreground">React Component</div>
              </div>
              <ArtifactClose />
            </ArtifactHeader>
            <div className="p-4">
              <CodeBlock
                code={
                  "export function WeatherWidget({ city }: { city: string }) {\n  return <div>Weather for {city}</div>;\n}"
                }
                language="typescript"
              />
            </div>
          </Artifact>
        </Section>

        <Section title="Attachments">
          <Attachments variant="grid">
            <Attachment
              data={{
                id: "1",
                type: "file",
                mediaType: "application/pdf",
                filename: "report.pdf",
                url: "",
              }}
            >
              <AttachmentPreview />
              <AttachmentRemove />
            </Attachment>
            <Attachment
              data={{
                id: "2",
                type: "file",
                mediaType: "image/jpeg",
                filename: "photo.jpg",
                url: "https://picsum.photos/seed/tokyo/200/150",
              }}
            >
              <AttachmentPreview />
              <AttachmentRemove />
            </Attachment>
          </Attachments>
        </Section>

        <Section title="Terminal">
          <Terminal
            output={terminalOutput}
            isStreaming={false}
            onClear={() => setTerminalOutput("")}
          >
            <TerminalHeader>
              <TerminalTitle>Shell</TerminalTitle>
              <TerminalActions>
                <TerminalCopyButton />
                <TerminalClearButton />
              </TerminalActions>
            </TerminalHeader>
            <TerminalContent />
          </Terminal>
        </Section>
      </div>
    </ScrollArea>
  );
}
