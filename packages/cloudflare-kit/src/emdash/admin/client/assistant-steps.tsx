/**
 * An assistant turn's work as a Trace: what it thought and each tool it used,
 * following shadcn's AI Elements Reasoning and Tool patterns.
 */
import {
  CircleAlertIcon,
  CircleCheckIcon,
  LightbulbIcon,
  LoaderCircleIcon,
} from "lucide-react";
import { useState } from "react";

import type { Step } from "#assistant/steps.ts";
import { CodeBlock, CodeBlockContent } from "#assistant/ui/code-block.tsx";
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "#assistant/ui/trace.tsx";

type ReasoningStep = Extract<Step, { kind: "reasoning" }>;
type ToolStep = Extract<Step, { kind: "tool" }>;

/** Opens while the model thinks and closes when it is done, unless the editor toggled it. */
const ReasoningLine = ({ step }: { readonly step: ReasoningStep }) => {
  const [open, setOpen] = useState<boolean>();
  const line = (
    <TraceLine status={step.running ? "running" : undefined}>
      <TraceIcon>
        {step.running ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <LightbulbIcon />
        )}
      </TraceIcon>
      <TraceTitle>
        {step.running ? "Thinking" : "Thought it through"}
      </TraceTitle>
    </TraceLine>
  );
  if (step.text.trim() === "") {
    return line;
  }
  return (
    <TraceCollapsible onOpenChange={setOpen} open={open ?? step.running}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="whitespace-pre-wrap">
        {step.text}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
};

const ToolIcon = ({ status }: { readonly status: ToolStep["status"] }) => {
  if (status === "running") {
    return <LoaderCircleIcon className="animate-spin" />;
  }
  return status === "failed" ? <CircleAlertIcon /> : <CircleCheckIcon />;
};

const Details = ({
  label,
  code,
}: {
  readonly label: string;
  readonly code: string;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className="text-xs font-medium">{label}</span>
    <CodeBlock size="sm">
      <CodeBlockContent className="max-h-56" wrap>
        {code}
      </CodeBlockContent>
    </CodeBlock>
  </div>
);

const LINE_STATUS = { failed: "error", running: "running" } as const;

const ToolLine = ({ step }: { readonly step: ToolStep }) => {
  const line = (
    <TraceLine
      status={step.status === "done" ? undefined : LINE_STATUS[step.status]}
    >
      <TraceIcon>
        <ToolIcon status={step.status} />
      </TraceIcon>
      <TraceTitle>
        {step.target === undefined
          ? step.title
          : `${step.title}: ${step.target}`}
      </TraceTitle>
    </TraceLine>
  );
  if (step.input === undefined && step.output === undefined) {
    return line;
  }
  return (
    <TraceCollapsible>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent>
        <div className="flex flex-col gap-3">
          {step.input !== undefined && (
            <Details code={step.input} label="Asked for" />
          )}
          {step.output !== undefined && (
            <Details
              code={step.output}
              label={step.status === "failed" ? "Problem" : "Got back"}
            />
          )}
        </div>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  );
};

export const AssistantSteps = ({
  steps,
}: {
  readonly steps: readonly Step[];
}) => (
  <Trace>
    {steps.map((step) =>
      step.kind === "reasoning" ? (
        <ReasoningLine key={step.key} step={step} />
      ) : (
        <ToolLine key={step.key} step={step} />
      )
    )}
  </Trace>
);
