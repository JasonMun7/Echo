"use client";

import { type ComponentProps } from "react";
import { type AgentState, type ReceivedMessage } from "@livekit/components-react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { AgentChatIndicator } from "@/components/agents-ui/agent-chat-indicator";
import { AnimatePresence, motion } from "motion/react";

/**
 * Props for the AgentChatTranscript component.
 */
export interface AgentChatTranscriptProps extends ComponentProps<"div"> {
  /**
   * The current state of the agent. When 'thinking', displays a loading indicator.
   */
  agentState?: AgentState;
  /**
   * Array of messages to display in the transcript.
   * @defaultValue []
   */
  messages?: ReceivedMessage[];
  /**
   * Additional CSS class names to apply to the conversation container.
   */
  className?: string;
}

/**
 * A chat transcript component that displays a conversation between the user and agent.
 * Shows messages with timestamps and origin indicators, plus a thinking indicator
 * when the agent is processing.
 *
 * @extends ComponentProps<'div'>
 *
 * @example
 * ```tsx
 * <AgentChatTranscript
 *   agentState={agentState}
 *   messages={chatMessages}
 * />
 * ```
 */
export function AgentChatTranscript({
  agentState,
  messages = [],
  className,
  ...props
}: AgentChatTranscriptProps) {
  /** Agent SDK often stays on `listening` during tools; infer pending reply from transcript + speech. */
  const last = messages.at(-1);
  const lastFromUser = last?.from?.isLocal === true;
  const awaitingAssistantReply = Boolean(lastFromUser && agentState !== "speaking");

  const showActivityIndicator =
    agentState === "thinking" || agentState === "initializing" || awaitingAssistantReply;

  return (
    <Conversation className={className} {...props}>
      <ConversationContent>
        {messages.map((receivedMessage) => {
          const { id, timestamp, from, message } = receivedMessage;
          const locale = navigator?.language ?? "en-US";
          const messageOrigin = from?.isLocal ? "user" : "assistant";
          const time = new Date(timestamp);
          const title = Number.isNaN(time.getTime())
            ? ""
            : time.toLocaleTimeString(locale, { timeStyle: "full" });

          return (
            <Message key={id} title={title} from={messageOrigin}>
              <MessageContent>
                <MessageResponse>{message}</MessageResponse>
              </MessageContent>
            </Message>
          );
        })}
        <AnimatePresence>
          {showActivityIndicator && (
            <motion.div
              key="agent-activity"
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 self-start pl-1"
              aria-live="polite"
              aria-label="EchoPrism is responding"
            >
              <AgentChatIndicator size="sm" />
              <span className="text-muted-foreground text-xs font-medium">
                EchoPrism is responding…
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </ConversationContent>
      <ConversationScrollButton />
    </Conversation>
  );
}
