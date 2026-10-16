/**
 * Turns an assistant message's TanStack AI parts into the steps the panel
 * shows: reasoning and tool calls as Trace lines, in plain words for editors
 * who never see a tool name. Pure, so it is tested without a browser.
 */
import type { UIMessage } from "@tanstack/ai-react";

import { prettyJson, readToolArgs, readToolError } from "./tool-args.ts";
import type { ToolArgs } from "./tool-args.ts";

type Part = UIMessage["parts"][number];
type ToolCallPart = Extract<Part, { type: "tool-call" }>;
type ToolResultPart = Extract<Part, { type: "tool-result" }>;

export type StepStatus = "running" | "done" | "failed";

export interface ReasoningStep {
  readonly kind: "reasoning";
  readonly key: string;
  readonly text: string;
  readonly running: boolean;
}

export interface ToolStep {
  readonly kind: "tool";
  readonly key: string;
  /** The tool's name, for logic; never shown. */
  readonly name: string;
  readonly status: StepStatus;
  readonly title: string;
  /** What the tool acted on (a collection, an entry, a search), when the input names one. */
  readonly target?: string;
  /** The tool's input, pretty-printed for the expanded view. */
  readonly input?: string;
  /** The tool's output or error, pretty-printed for the expanded view. */
  readonly output?: string;
}

export type Step = ReasoningStep | ToolStep;

type Titles = readonly [running: string, done: string, failed: string];

/** Plain words for each tool the assistant may call. */
const TITLES = new Map<string, Titles>([
  [
    "content_compare",
    [
      "Comparing with the live page",
      "Compared with the live page",
      "Couldn't compare with the live page",
    ],
  ],
  [
    "content_create",
    ["Creating a draft", "Created a draft", "Couldn't create a draft"],
  ],
  [
    "content_get",
    ["Reading an entry", "Read an entry", "Couldn't read an entry"],
  ],
  [
    "content_list",
    ["Listing entries", "Listed entries", "Couldn't list entries"],
  ],
  [
    "content_translations",
    [
      "Checking translations",
      "Checked translations",
      "Couldn't check translations",
    ],
  ],
  [
    "content_update",
    ["Saving a draft", "Saved a draft", "Couldn't save a draft"],
  ],
  [
    "describe_photo",
    ["Looking at a photo", "Looked at a photo", "Couldn't look at a photo"],
  ],
  ["load_skill", ["Reading up", "Read up", "Couldn't read up"]],
  [
    "media_get",
    ["Looking up a photo", "Looked up a photo", "Couldn't look up a photo"],
  ],
  [
    "media_list",
    [
      "Browsing the media library",
      "Browsed the media library",
      "Couldn't browse the media library",
    ],
  ],
  [
    "revision_list",
    ["Checking revisions", "Checked revisions", "Couldn't check revisions"],
  ],
  [
    "schema_get_block_type",
    [
      "Checking a section type",
      "Checked a section type",
      "Couldn't check a section type",
    ],
  ],
  [
    "schema_get_collection",
    ["Checking the fields", "Checked the fields", "Couldn't check the fields"],
  ],
  [
    "schema_list_block_types",
    [
      "Checking section types",
      "Checked section types",
      "Couldn't check section types",
    ],
  ],
  [
    "schema_list_collections",
    [
      "Checking content types",
      "Checked content types",
      "Couldn't check content types",
    ],
  ],
  [
    "search",
    ["Searching the site", "Searched the site", "Couldn't search the site"],
  ],
]);

const STATUS_INDEX = { done: 1, failed: 2, running: 0 } as const;

export const toolTitle = (name: string, status: StepStatus): string =>
  TITLES.get(name)?.[STATUS_INDEX[status]] ?? name;

/** "pages / about", a search query in quotes, or a skill in words: enough to tell two calls apart. */
export const toolTarget = (args: ToolArgs): string | undefined => {
  if (args.query !== undefined) {
    return `"${args.query}"`;
  }
  if (args.name !== undefined) {
    return args.name.replaceAll("-", " ");
  }
  const parts = [args.collection, args.slug ?? args.id].filter(
    (part) => part !== undefined
  );
  return parts.length === 0 ? undefined : parts.join(" / ");
};

const resultText = (result: ToolResultPart): string =>
  Array.isArray(result.content)
    ? result.content
        .flatMap((part) => (part.type === "text" ? [part.content] : []))
        .join("\n")
    : result.content;

const stepStatus = (
  call: ToolCallPart,
  result: ToolResultPart | undefined,
  output: string | undefined,
  streaming: boolean
): StepStatus => {
  if (
    call.state === "error" ||
    result?.state === "error" ||
    (output !== undefined && readToolError(output) !== undefined)
  ) {
    return "failed";
  }
  if (result === undefined) {
    // No result yet: still working while the turn streams, cut off once it has stopped.
    return streaming ? "running" : "failed";
  }
  return "done";
};

const toolStep = (
  call: ToolCallPart,
  result: ToolResultPart | undefined,
  streaming: boolean
): ToolStep => {
  const output =
    result === undefined ? undefined : (result.error ?? resultText(result));
  const status = stepStatus(call, result, output, streaming);
  return {
    input: call.arguments === "" ? undefined : prettyJson(call.arguments),
    key: call.id,
    kind: "tool",
    name: call.name,
    output:
      output === undefined || output === "" ? undefined : prettyJson(output),
    status,
    target: toolTarget(readToolArgs(call.arguments)),
    title: toolTitle(call.name, status),
  };
};

/**
 * The steps of one assistant message, in the order they happened. `streaming`
 * is true while this message is the one being written.
 */
export const messageSteps = (
  message: UIMessage,
  streaming: boolean
): Step[] => {
  const results = new Map<string, ToolResultPart>();
  for (const part of message.parts) {
    if (part.type === "tool-result") {
      results.set(part.toolCallId, part);
    }
  }
  const last = message.parts.at(-1);
  return message.parts.flatMap((part, index): Step[] => {
    if (part.type === "thinking") {
      return [
        {
          key: `thinking-${index}`,
          kind: "reasoning",
          running: streaming && part === last,
          text: part.content,
        },
      ];
    }
    if (part.type === "tool-call") {
      return [toolStep(part, results.get(part.id), streaming)];
    }
    return [];
  });
};

/** The reply text of a message: every text part, in order. */
export const messageText = (message: UIMessage): string =>
  message.parts
    .flatMap((part) => (part.type === "text" ? [part.content] : []))
    .join("");

/** Tools that change content; after one succeeds the open editor is out of date. */
const WRITES = new Set(["content_create", "content_update"]);

export const savedDraft = (message: UIMessage): boolean =>
  messageSteps(message, false).some(
    (step) =>
      step.kind === "tool" && step.status === "done" && WRITES.has(step.name)
  );
