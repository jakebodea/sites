/**
 * The conversation: TanStack AI's `useChat` streaming from the assistant route,
 * laid out with shadcn's AI Elements Chat, Message, Suggestion and Prompt
 * Input patterns. Each turn shows its reasoning and tool steps above the reply.
 */
import {
  fetchServerSentEvents,
  sessionStoragePersistence,
  useChat,
} from "@tanstack/ai-react";
import type { UIMessage } from "@tanstack/ai-react";
import { TextPart } from "@tanstack/ai-react/ui";
import {
  ArrowUpIcon,
  RotateCwIcon,
  ImageIcon,
  PhoneIcon,
  SparklesIcon,
  SpellCheckIcon,
  SquareIcon,
  SquarePenIcon,
  XIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import type { SubmitEvent } from "react";

import { AssistantSteps } from "#assistant/assistant-steps.tsx";
import { isLongConversation } from "#assistant/conversation-size.ts";
import { failureKind } from "#assistant/errors.ts";
import type { FailureKind } from "#assistant/errors.ts";
import { messageSteps, messageText, savedDraft } from "#assistant/steps.ts";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "#assistant/ui/alert.tsx";
import { Bubble, BubbleContent } from "#assistant/ui/bubble.tsx";
import { Button } from "#assistant/ui/button.tsx";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "#assistant/ui/input-group.tsx";
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "#assistant/ui/message-scroller.tsx";
import { Message, MessageContent } from "#assistant/ui/message.tsx";
import {
  SheetClose,
  SheetDescription,
  SheetTitle,
} from "#assistant/ui/sheet.tsx";
import { Suggestion, Suggestions } from "#assistant/ui/suggestion.tsx";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#assistant/ui/tooltip.tsx";

import {
  CHAT_PATH,
  CSRF_HEADERS,
  PRESET_LABELS,
} from "../assistant/protocol.ts";
import type {
  OpenEntry,
  PanelConfig,
  TurnContext,
} from "../assistant/protocol.ts";
import type { AssistantPreset } from "../options.ts";

/** One conversation per tab: it survives navigating the admin and reloading the page. */
const persistence = sessionStoragePersistence();
const connection = fetchServerSentEvents(CHAT_PATH, { headers: CSRF_HEADERS });
export const THREAD_ID = "site-assistant";

/** Markdown from the model, styled to sit in a narrow panel. */
const Reply = ({ text }: { readonly text: string }) => (
  <TextPart
    className="[&_code]:bg-muted flex min-w-0 flex-col gap-2 leading-relaxed wrap-break-word [&_a]:font-medium [&_a]:underline [&_a]:underline-offset-4 [&_code]:rounded-sm [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs [&_h1,&_h2,&_h3]:font-medium [&_li+li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_strong]:font-medium [&_ul]:list-disc [&_ul]:pl-5"
    content={text}
  />
);

const UserTurn = ({ message }: { readonly message: UIMessage }) => (
  <Message align="end">
    <MessageContent>
      <Bubble align="end" variant="muted">
        <BubbleContent className="whitespace-pre-wrap">
          {messageText(message)}
        </BubbleContent>
      </Bubble>
    </MessageContent>
  </Message>
);

const AssistantTurn = ({
  message,
  streaming,
  entryOpen,
}: {
  readonly message: UIMessage;
  readonly streaming: boolean;
  readonly entryOpen: boolean;
}) => {
  const steps = messageSteps(message, streaming);
  const reply = messageText(message);
  return (
    <Message>
      <MessageContent>
        <div className="flex w-full flex-col gap-3">
          {steps.length > 0 && <AssistantSteps steps={steps} />}
          {reply !== "" && <Reply text={reply} />}
          {!streaming && entryOpen && savedDraft(message) && (
            <Alert>
              <AlertTitle>Draft saved</AlertTitle>
              <AlertDescription>
                Reload this page to see the changes, then review and select
                Publish.
              </AlertDescription>
              <AlertAction>
                <Button
                  onClick={() => {
                    globalThis.location.reload();
                  }}
                  size="sm"
                  variant="outline"
                >
                  <RotateCwIcon data-icon="inline-start" />
                  Reload
                </Button>
              </AlertAction>
            </Alert>
          )}
        </div>
      </MessageContent>
    </Message>
  );
};

/**
 * Starters for a client facing an empty box: the everyday jobs on a marketing site.
 * Each fills the message box rather than sending, so the details can be added first.
 */
const STARTERS = [
  { icon: <SpellCheckIcon />, prompt: "Fix typos and grammar across the site" },
  { icon: <PhoneIcon />, prompt: "Update our phone number everywhere to " },
  { icon: <ImageIcon />, prompt: "Write alt text for photos that have none" },
] as const;

/** What went wrong, in the person's terms, with the one action that helps. */
const FAILURES = {
  other: {
    action: "retry",
    description:
      "Nothing changed after the problem. Try again in a minute, or with a smaller request.",
    title: "The assistant could not finish",
  },
  "rate-limit": {
    action: "retry",
    description:
      "It has had a lot of requests in the last few minutes. Wait a few minutes, then try again.",
    title: "The assistant is busy",
  },
  "too-long": {
    action: "restart",
    description:
      "Start a new conversation and say what is left to do. Drafts it already saved stay saved.",
    title: "This conversation is too long",
  },
} as const;

const FailureNotice = ({
  kind,
  onRetry,
  onRestart,
}: {
  readonly kind: FailureKind;
  readonly onRetry: () => void;
  readonly onRestart: () => void;
}) => {
  const failure = FAILURES[kind];
  return (
    <Alert variant="destructive">
      <AlertTitle>{failure.title}</AlertTitle>
      <AlertDescription>{failure.description}</AlertDescription>
      <AlertAction>
        {failure.action === "retry" ? (
          <Button onClick={onRetry} size="sm" variant="outline">
            <RotateCwIcon data-icon="inline-start" />
            Retry
          </Button>
        ) : (
          <Button onClick={onRestart} size="sm" variant="outline">
            <SquarePenIcon data-icon="inline-start" />
            New conversation
          </Button>
        )}
      </AlertAction>
    </Alert>
  );
};

const presetsFor = (config: PanelConfig, entry: OpenEntry | undefined) =>
  entry !== undefined &&
  (config.collections === undefined ||
    config.collections.includes(entry.collection))
    ? config.presets
    : [];

export const AssistantChat = ({
  config,
  entry,
}: {
  readonly config: PanelConfig;
  readonly entry: OpenEntry | undefined;
}) => {
  const { messages, sendMessage, status, stop, error, reload, clear } = useChat(
    {
      connection,
      persistence,
      threadId: THREAD_ID,
    }
  );
  const [text, setText] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const busy = status === "submitted" || status === "streaming";
  const presets = presetsFor(config, entry);

  const send = (content: string, preset?: AssistantPreset) => {
    const turn: TurnContext = { entry, preset };
    void sendMessage(content, { body: turn });
  };

  const draft = (prompt: string) => {
    setText(prompt);
    const box = textareaRef.current;
    box?.focus();
    // After React writes the value, so the caret lands at its end.
    requestAnimationFrame(() => {
      box?.setSelectionRange(prompt.length, prompt.length);
    });
  };

  const onSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = text.trim();
    if (content === "" || busy) {
      return;
    }
    send(content);
    setText("");
  };

  return (
    <MessageScrollerProvider autoScroll>
      {/* One wrapper, so the sheet's gap does not push the conversation away from its top row. */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* Title and description are for screen readers; the top row is only the two actions, level with the admin's top bar. */}
        <SheetTitle className="sr-only">Assistant</SheetTitle>
        <SheetDescription className="sr-only">
          {entry === undefined
            ? "Edits the site as drafts"
            : `Working on this ${entry.collection} entry`}
        </SheetDescription>
        <div className="flex h-14.5 shrink-0 items-center justify-end gap-1 px-4">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="New conversation"
                  disabled={busy || messages.length === 0}
                  onClick={clear}
                  size="icon-sm"
                  variant="ghost"
                />
              }
            >
              <SquarePenIcon />
            </TooltipTrigger>
            <TooltipContent>New conversation</TooltipContent>
          </Tooltip>
          <SheetClose
            render={
              <Button aria-label="Close" size="icon-sm" variant="ghost" />
            }
          >
            <XIcon />
          </SheetClose>
        </div>
        <div className="flex min-h-0 flex-1 flex-col">
          {messages.length === 0 ? (
            <div className="flex flex-1 flex-col justify-end gap-5 px-4 pb-4">
              <div className="flex flex-col gap-3">
                <SparklesIcon className="text-primary size-6" />
                <h2 className="text-2xl font-medium tracking-tight text-balance">
                  {entry === undefined
                    ? `What should we change on ${config.siteName}?`
                    : "What should we change on this page?"}
                </h2>
              </div>
              {entry === undefined && (
                <Suggestions>
                  {STARTERS.map(({ icon, prompt }) => (
                    <Suggestion
                      icon={icon}
                      key={prompt}
                      onClick={() => {
                        draft(prompt);
                      }}
                    >
                      {prompt.trimEnd()}
                    </Suggestion>
                  ))}
                </Suggestions>
              )}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-4">
              <MessageScroller>
                <MessageScrollerViewport>
                  <MessageScrollerContent aria-busy={busy}>
                    {messages.map((message) =>
                      message.role === "user" ? (
                        <MessageScrollerItem
                          key={message.id}
                          messageId={message.id}
                          scrollAnchor
                        >
                          <UserTurn message={message} />
                        </MessageScrollerItem>
                      ) : (
                        <MessageScrollerItem
                          key={message.id}
                          messageId={message.id}
                        >
                          <AssistantTurn
                            entryOpen={entry !== undefined}
                            message={message}
                            streaming={busy && message === messages.at(-1)}
                          />
                        </MessageScrollerItem>
                      )
                    )}
                    {status === "submitted" &&
                      messages.at(-1)?.role === "user" && (
                        <MessageScrollerItem messageId="pending">
                          <p className="text-muted-foreground shimmer text-sm">
                            Working on it
                          </p>
                        </MessageScrollerItem>
                      )}
                    {error !== undefined && (
                      <MessageScrollerItem messageId="error">
                        <FailureNotice
                          kind={failureKind(error.message)}
                          onRestart={clear}
                          onRetry={() => {
                            void reload();
                          }}
                        />
                      </MessageScrollerItem>
                    )}
                  </MessageScrollerContent>
                </MessageScrollerViewport>
                <MessageScrollerButton />
              </MessageScroller>
            </div>
          )}
          <div className="flex flex-col gap-2 p-4 pt-2">
            {!busy && isLongConversation(messages) && (
              <Alert>
                <AlertTitle>This conversation is getting long</AlertTitle>
                <AlertDescription>
                  A new one keeps the assistant quick. Drafts it saved stay
                  saved.
                </AlertDescription>
                <AlertAction>
                  <Button onClick={clear} size="sm" variant="outline">
                    <SquarePenIcon data-icon="inline-start" />
                    New conversation
                  </Button>
                </AlertAction>
              </Alert>
            )}
            {presets.length > 0 && (
              <div className="scroll-fade-x flex scrollbar-none gap-2 overflow-x-auto overscroll-x-contain">
                {presets.map((preset) => (
                  <Button
                    className="shrink-0"
                    disabled={busy}
                    key={preset}
                    onClick={() => {
                      send(PRESET_LABELS[preset], preset);
                    }}
                    size="sm"
                    variant="outline"
                  >
                    {PRESET_LABELS[preset]}
                  </Button>
                ))}
              </div>
            )}
            <form onSubmit={onSubmit} ref={formRef}>
              <InputGroup>
                <InputGroupTextarea
                  aria-label="Message"
                  ref={textareaRef}
                  className="max-h-40 min-h-16"
                  onChange={(event) => {
                    setText(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      formRef.current?.requestSubmit();
                    }
                  }}
                  placeholder={
                    entry === undefined
                      ? "Describe a change to the site"
                      : "Describe a change to this page"
                  }
                  value={text}
                />
                <InputGroupAddon align="block-end">
                  {busy ? (
                    <InputGroupButton
                      aria-label="Stop"
                      className="ml-auto"
                      onClick={stop}
                      size="icon-sm"
                      type="button"
                      variant="default"
                    >
                      <SquareIcon />
                    </InputGroupButton>
                  ) : (
                    <InputGroupButton
                      aria-label="Send"
                      className="ml-auto"
                      disabled={text.trim() === ""}
                      size="icon-sm"
                      type="submit"
                      variant="default"
                    >
                      <ArrowUpIcon />
                    </InputGroupButton>
                  )}
                </InputGroupAddon>
              </InputGroup>
            </form>
          </div>
        </div>
      </div>
    </MessageScrollerProvider>
  );
};
