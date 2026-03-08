import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "../../components/ai-elements/conversation";
import { ClaudeCodeMessageParts } from "../../components/claude-code/message-parts";
import { mockMessages } from "./chat/claude-code-mock-data";

export default function ChatPlayground() {
  return (
    <Conversation className="h-full">
      <ConversationContent className="mx-auto max-w-2xl">
        {mockMessages.map((message) => (
          <ClaudeCodeMessageParts key={message.id} message={message as any} />
        ))}
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
