/**
 * Proof receipts: a pull request is a claim about one exact revision. A
 * receipt binds the checked commands, captured evidence, risk tier, and
 * verdict to the head SHA and stable patch ID, and `verify` rejects it once
 * the code, logs, media, or report drift. Pure logic; I/O lives in `cli.ts`.
 * Ported from pcobooster's proofed delivery (docs/proofed-delivery.md there).
 */
import { createHash } from "node:crypto";
import path from "node:path";

import { Schema } from "effect";

import type { ProofConfig } from "./config.ts";

export const RiskTier = Schema.Literals(["low", "medium", "high", "critical"]);
export type RiskTier = typeof RiskTier.Type;

export const Verdict = Schema.Literals([
  "PASS",
  "PASS_WITH_NOTES",
  "FAIL",
  "BLOCKED",
]);
export type Verdict = typeof Verdict.Type;

const RANK = { critical: 3, high: 2, low: 0, medium: 1 } as const;

const NonEmpty = Schema.NonEmptyString;
const Sha256 = Schema.String.check(Schema.isPattern(/^[a-f\d]{64}$/u));

export const ProofArtifact = Schema.Struct({
  alt: NonEmpty,
  kind: Schema.Literals(["image", "video"]),
  path: NonEmpty,
  sha256: Sha256,
});
export type ProofArtifact = typeof ProofArtifact.Type;

export const ProofCommand = Schema.Struct({
  command: NonEmpty,
  durationMs: Schema.Number,
  exitCode: Schema.Number,
  logPath: NonEmpty,
  name: NonEmpty,
  sha256: Sha256,
  status: Schema.Literals(["pass", "fail"]),
});
export type ProofCommand = typeof ProofCommand.Type;

export const IndependentVerification = Schema.Struct({
  source: NonEmpty,
  summary: NonEmpty,
  verdict: Schema.Literals(["PASS", "PASS_WITH_NOTES"]),
});
export type IndependentVerification = typeof IndependentVerification.Type;

export const ProofReceipt = Schema.Struct({
  artifacts: Schema.Array(ProofArtifact),
  base: Schema.Struct({ ref: NonEmpty, sha: NonEmpty }),
  changedFiles: Schema.Array(NonEmpty),
  commands: Schema.Array(ProofCommand),
  createdAt: NonEmpty,
  flows: Schema.Array(NonEmpty),
  focusedChecks: Schema.Array(ProofCommand),
  headSha: NonEmpty,
  independentVerification: Schema.NullOr(IndependentVerification),
  notes: Schema.Array(NonEmpty),
  patchId: NonEmpty,
  requiresVisualEvidence: Schema.Boolean,
  riskTier: RiskTier,
  rollback: Schema.NullOr(NonEmpty),
  schemaVersion: Schema.Literal(1),
  verdict: Verdict,
});
export type ProofReceipt = typeof ProofReceipt.Type;

export const maxRiskTier = (first: RiskTier, second: RiskTier): RiskTier =>
  RANK[first] >= RANK[second] ? first : second;

export const classifyPath = (
  config: ProofConfig,
  changedPath: string
): RiskTier => {
  const tiers = ["critical", "high", "medium"] as const;
  return (
    tiers.find((tier) =>
      config.risk[tier].some((pattern) => pattern.test(changedPath))
    ) ?? "low"
  );
};

export const classifyChangedFiles = (
  config: ProofConfig,
  paths: readonly string[]
): RiskTier => {
  let highest: RiskTier = "low";
  for (const changedPath of paths) {
    highest = maxRiskTier(highest, classifyPath(config, changedPath));
  }
  return highest;
};

export const requiresVisualEvidence = (
  config: ProofConfig,
  paths: readonly string[]
): boolean =>
  paths.some(
    (changedPath) =>
      config.visual.some((pattern) => pattern.test(changedPath)) &&
      !config.visualExempt.some((pattern) => pattern.test(changedPath))
  );

export const expectedCommandNames = (
  riskTier: RiskTier,
  ciPassed: boolean
): string[] => (riskTier === "low" || !ciPassed ? ["ci"] : ["ci", "build"]);

type VerdictInputs = Pick<
  ProofReceipt,
  | "artifacts"
  | "commands"
  | "focusedChecks"
  | "independentVerification"
  | "notes"
  | "requiresVisualEvidence"
  | "riskTier"
  | "rollback"
>;

const isElevated = (tier: RiskTier) => tier === "high" || tier === "critical";

/** Why a receipt cannot pass yet, or an empty list. */
const blockers = (receipt: VerdictInputs): string[] => {
  const reasons: string[] = [];
  if (receipt.requiresVisualEvidence && receipt.artifacts.length === 0) {
    reasons.push("visible change without an image or video");
  }
  if (
    isElevated(receipt.riskTier) &&
    receipt.independentVerification === null
  ) {
    reasons.push("high-risk change without an independent verifier");
  }
  if (receipt.riskTier === "critical" && receipt.rollback === null) {
    reasons.push("critical change without a rollback plan");
  }
  if (receipt.riskTier === "critical" && receipt.focusedChecks.length === 0) {
    reasons.push("critical change without a focused boundary check");
  }
  return reasons;
};

export const deriveVerdict = (receipt: VerdictInputs): Verdict => {
  const failed = [...receipt.commands, ...receipt.focusedChecks].some(
    (command) => command.status === "fail"
  );
  if (failed) {
    return "FAIL";
  }
  if (blockers(receipt).length > 0) {
    return "BLOCKED";
  }
  const hasNotes =
    receipt.notes.length > 0 ||
    receipt.independentVerification?.verdict === "PASS_WITH_NOTES";
  return hasNotes ? "PASS_WITH_NOTES" : "PASS";
};

/** Notes explaining every blocker, recorded on the receipt so reviewers see why. */
export const blockerNotes = (receipt: VerdictInputs): string[] =>
  blockers(receipt).map((reason) => `Blocked: ${reason}.`);

const arraysEqual = (first: readonly string[], second: readonly string[]) =>
  first.length === second.length &&
  first.every((value, index) => value === second[index]);

export interface ReceiptFacts {
  readonly changedFiles: readonly string[];
  readonly minimumRiskTier: RiskTier;
  readonly requiresVisualEvidence: boolean;
  readonly gates: ProofConfig["gates"];
}

const commandViolations = (
  receipt: ProofReceipt,
  gates: ProofConfig["gates"]
): string[] => {
  const violations: string[] = [];
  const canonical = new Map([
    ["ci", gates.ci.command.join(" ")],
    ["build", gates.build.command.join(" ")],
  ]);
  for (const command of receipt.commands) {
    if (command.command !== canonical.get(command.name)) {
      violations.push(`${command.name} command is not the canonical gate`);
    }
  }
  for (const command of [...receipt.commands, ...receipt.focusedChecks]) {
    if ((command.exitCode === 0) !== (command.status === "pass")) {
      violations.push(`${command.name} status contradicts its exit code`);
    }
  }
  return violations;
};

export const validateReceiptSemantics = (
  receipt: ProofReceipt,
  facts: ReceiptFacts
): string[] => {
  const violations: string[] = [];
  if (!arraysEqual(receipt.changedFiles, facts.changedFiles)) {
    violations.push("changed files do not match the proved revision");
  }
  if (
    maxRiskTier(receipt.riskTier, facts.minimumRiskTier) !== receipt.riskTier
  ) {
    violations.push("risk tier is lower than the changed paths require");
  }
  if (receipt.requiresVisualEvidence !== facts.requiresVisualEvidence) {
    violations.push("visual-evidence requirement does not match changed paths");
  }
  const ciPassed = receipt.commands[0]?.status === "pass";
  const names = receipt.commands.map((command) => command.name);
  if (!arraysEqual(names, expectedCommandNames(receipt.riskTier, ciPassed))) {
    violations.push("recorded gates do not match the risk tier and CI result");
  }
  violations.push(...commandViolations(receipt, facts.gates));
  if (receipt.verdict !== deriveVerdict(receipt)) {
    violations.push("verdict contradicts the recorded evidence");
  }
  return violations;
};

export const sha256 = (contents: Uint8Array): string =>
  createHash("sha256").update(contents).digest("hex");

const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm"]);
const IMAGE_EXTENSIONS = new Set([".gif", ".jpeg", ".jpg", ".png", ".webp"]);

export const artifactKindForPath = (
  artifactPath: string
): ProofArtifact["kind"] => {
  const extension = path.extname(artifactPath).toLowerCase();
  if (VIDEO_EXTENSIONS.has(extension)) {
    return "video";
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return "image";
  }
  throw new Error(`Proof artifact must be an image or video: ${artifactPath}`);
};

export const githubAttachmentArgument = (
  artifactPath: string,
  artifact: Pick<ProofArtifact, "alt" | "kind">
): string =>
  artifact.kind === "image" ? `${artifactPath}#${artifact.alt}` : artifactPath;

const escapeCell = (value: string): string =>
  value.replaceAll("|", String.raw`\|`);

const bulletList = (items: readonly string[], empty: string): string =>
  items.length === 0 ? empty : items.map((item) => `- ${item}`).join("\n");

export const renderProofReport = (receipt: ProofReceipt): string => {
  const commands = [...receipt.commands, ...receipt.focusedChecks]
    .map(
      (command) =>
        `| ${escapeCell(command.name)} | ${command.status} | \`${escapeCell(command.command)}\` | ${command.durationMs} ms |`
    )
    .join("\n");
  const artifacts = bulletList(
    receipt.artifacts.map(
      (artifact) =>
        `${artifact.kind}: ${artifact.alt} (SHA-256 \`${artifact.sha256}\`)`
    ),
    "- None required or captured."
  );
  const verifier = receipt.independentVerification;
  const independent =
    verifier === null
      ? "- Not recorded."
      : `- ${verifier.verdict} by ${verifier.source}: ${verifier.summary}`;
  const visual = receipt.requiresVisualEvidence
    ? " · visual evidence required"
    : "";
  return `<!-- proofed-delivery:${receipt.headSha} -->
## Verification proof: ${receipt.verdict}

Bound to head \`${receipt.headSha}\`, base \`${receipt.base.sha}\`, and stable patch \`${receipt.patchId}\`.

Risk: **${receipt.riskTier}**${visual}

| Gate | Result | Command | Duration |
| --- | --- | --- | --- |
${commands}

### Verified flows

${bulletList(receipt.flows, "- No interactive flow was claimed.")}

### Evidence

${artifacts}

### Independent verification

${independent}

### Rollback

${receipt.rollback ?? "Not required or not recorded."}

### Limitations and notes

${bulletList(receipt.notes, "- None.")}
`;
};
