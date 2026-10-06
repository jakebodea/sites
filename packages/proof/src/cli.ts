#!/usr/bin/env bun
/**
 * `bun run proof -- doctor|run|verify|publish`. See docs/proof.md and the
 * `proof` skill. Receipts land in `.artifacts/proofs/<time>-<sha>/`.
 */
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { Predicate, Schema } from "effect";

import type { ProofConfig } from "./config.ts";
import {
  IndependentVerification,
  ProofReceipt,
  RiskTier,
  artifactKindForPath,
  blockerNotes,
  classifyChangedFiles,
  deriveVerdict,
  githubAttachmentArgument,
  maxRiskTier,
  renderProofReport,
  requiresVisualEvidence,
  sha256,
  validateReceiptSemantics,
} from "./core.ts";
import type { ProofArtifact, ProofCommand } from "./core.ts";

const run = (
  file: string,
  args: readonly string[],
  cwd: string,
  input?: Buffer
) => execFileSync(file, [...args], { cwd, encoding: "utf-8", input }).trim();

const repositoryRoot = run(
  "git",
  ["rev-parse", "--show-toplevel"],
  process.cwd()
);
const git = (args: readonly string[]) => run("git", args, repositoryRoot);

const fail = (message: string): never => {
  throw new Error(message);
};

const Patterns = Schema.Array(Schema.instanceOf(RegExp));
const Gate = Schema.Struct({ command: Schema.Array(Schema.String) });
/** Runtime check for proof.config.ts (it is user code loaded by path). */
const ProofPolicy = Schema.Struct({
  gates: Schema.Struct({ build: Gate, ci: Gate }),
  risk: Schema.Struct({ critical: Patterns, high: Patterns, medium: Patterns }),
  visual: Patterns,
  visualExempt: Patterns,
});

const loadConfig = async (): Promise<ProofConfig> => {
  const file = path.join(repositoryRoot, "proof.config.ts");
  const module: unknown = await import(pathToFileURL(file).href);
  if (!Predicate.hasProperty(module, "default")) {
    return fail(`${file} must default-export defineProofConfig({ ... })`);
  }
  const config: ProofConfig = Schema.decodeUnknownSync(ProofPolicy)(
    module.default
  );
  return config;
};

/** Every value of a repeatable flag, e.g. `--artifact a --artifact b`. */
const flagValues = (args: readonly string[], name: string): string[] =>
  args.flatMap((arg, index) => {
    const value = args[index + 1];
    return arg === name && value !== undefined && !value.startsWith("--")
      ? [value]
      : [];
  });

const flag = (args: readonly string[], name: string): string | undefined =>
  flagValues(args, name).at(-1);

const changedFilesBetween = (base: string, head: string): string[] =>
  git(["diff", "--name-only", `${base}...${head}`])
    .split("\n")
    .filter((line) => line !== "");

/** Largest `git diff --binary` the patch ID is computed over. */
const PATCH_MAX_BYTES = 512 * 1024 * 1024;

const patchId = (base: string, head: string): string => {
  const diff = execFileSync("git", ["diff", "--binary", `${base}...${head}`], {
    cwd: repositoryRoot,
    // Binary patches (a new site's seed photos) easily pass the 1 MiB default.
    maxBuffer: PATCH_MAX_BYTES,
  });
  if (diff.length === 0) {
    return fail("The proof range has no changes");
  }
  const [id] = run("git", ["patch-id", "--stable"], repositoryRoot, diff).split(
    /\s+/u
  );
  return id ?? fail("Could not calculate a stable patch ID");
};

const capture = async (
  name: string,
  argv: readonly string[],
  directory: string,
  logName: string = name
): Promise<ProofCommand> => {
  const started = performance.now();
  const [file, ...rest] = argv;
  const child = spawn(file ?? fail("Command must not be empty"), rest, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks: Buffer[] = [];
  const collect = (chunk: Buffer) => {
    chunks.push(chunk);
  };
  child.stdout.on("data", collect);
  child.stderr.on("data", collect);
  await once(child, "close");
  const exitCode = child.exitCode ?? 1;
  const logPath = path.join("logs", `${logName}.log`);
  const log = Buffer.concat(chunks);
  writeFileSync(path.join(directory, logPath), log);
  return {
    command: argv.join(" "),
    durationMs: Math.round(performance.now() - started),
    exitCode,
    logPath,
    name,
    sha256: sha256(log),
    status: exitCode === 0 ? "pass" : "fail",
  };
};

const storeArtifact = (value: string, directory: string): ProofArtifact => {
  const hash = value.lastIndexOf("#");
  const supplied = hash === -1 ? value : value.slice(0, hash);
  const source = path.resolve(repositoryRoot, supplied);
  if (!existsSync(source)) {
    return fail(`Proof artifact does not exist: ${supplied}`);
  }
  const contents = readFileSync(source);
  const contentHash = sha256(contents);
  mkdirSync(path.join(directory, "artifacts"), { recursive: true });
  const stored = path.join(
    "artifacts",
    `${contentHash.slice(0, 12)}-${path.basename(source)}`
  );
  copyFileSync(source, path.join(directory, stored));
  const alt = hash === -1 ? "" : value.slice(hash + 1);
  return {
    alt: alt === "" ? path.basename(source) : alt,
    kind: artifactKindForPath(source),
    path: stored,
    sha256: contentHash,
  };
};

const independentVerification = (args: readonly string[]) => {
  const fields = {
    source: flag(args, "--verifier-source"),
    summary: flag(args, "--verifier-summary"),
    verdict: flag(args, "--verifier-verdict"),
  };
  const supplied = Object.values(fields).filter((value) => value !== undefined);
  if (supplied.length === 0) {
    return null;
  }
  if (supplied.length !== 3) {
    return fail(
      "--verifier-verdict, --verifier-summary, and --verifier-source go together"
    );
  }
  return Schema.decodeUnknownSync(IndependentVerification)(fields);
};

const focusedCheck = (value: string) => {
  const separator = value.indexOf("::");
  const name = value.slice(0, Math.max(separator, 0)).trim();
  const command = value.slice(separator + 2).trim();
  if (separator === -1 || name === "" || command === "") {
    return fail("--focused-check must look like name::command");
  }
  return { command, name };
};

const runProof = async (args: readonly string[]): Promise<void> => {
  const config = await loadConfig();
  if (git(["status", "--porcelain"]) !== "") {
    fail("Commit or stash changes first: proof is bound to a commit.");
  }
  const baseRef = flag(args, "--base") ?? "origin/main";
  const headSha = git(["rev-parse", "HEAD"]);
  const baseSha = git(["merge-base", baseRef, headSha]);
  const changedFiles = changedFilesBetween(baseSha, headSha);
  if (changedFiles.length === 0) {
    fail(`No changed files between ${baseRef} and HEAD`);
  }
  const requested = flag(args, "--risk") ?? "auto";
  const automatic = classifyChangedFiles(config, changedFiles);
  const riskTier =
    requested === "auto"
      ? automatic
      : maxRiskTier(automatic, Schema.decodeUnknownSync(RiskTier)(requested));
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, "-");
  const directory = path.join(
    repositoryRoot,
    ".artifacts",
    "proofs",
    `${stamp}-${headSha.slice(0, 8)}`
  );
  mkdirSync(path.join(directory, "logs"), { recursive: true });

  const commands = [await capture("ci", config.gates.ci.command, directory)];
  const ciPassed = commands.every((command) => command.status === "pass");
  if (riskTier !== "low" && ciPassed) {
    commands.push(
      await capture("build", config.gates.build.command, directory)
    );
  }
  const allPassed = commands.every((command) => command.status === "pass");
  const focusedChecks: ProofCommand[] = [];
  if (allPassed) {
    for (const [index, check] of flagValues(args, "--focused-check")
      .map(focusedCheck)
      .entries()) {
      focusedChecks.push(
        await capture(
          check.name,
          ["/bin/sh", "-c", check.command],
          directory,
          `focused-${index + 1}`
        )
      );
    }
  }
  const draft = {
    artifacts: flagValues(args, "--artifact").map((value) =>
      storeArtifact(value, directory)
    ),
    commands,
    focusedChecks,
    independentVerification: independentVerification(args),
    notes: flagValues(args, "--note"),
    requiresVisualEvidence: requiresVisualEvidence(config, changedFiles),
    riskTier,
    rollback: flag(args, "--rollback") ?? null,
  };
  const notes = [...draft.notes, ...blockerNotes(draft)];
  const evidence = { ...draft, notes };
  const receipt: ProofReceipt = {
    ...evidence,
    base: { ref: baseRef, sha: baseSha },
    changedFiles,
    createdAt: new Date().toISOString(),
    flows: flagValues(args, "--flow"),
    headSha,
    patchId: patchId(baseSha, headSha),
    schemaVersion: 1,
    verdict: deriveVerdict(evidence),
  };
  const receiptPath = path.join(directory, "receipt.json");
  writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  writeFileSync(path.join(directory, "report.md"), renderProofReport(receipt));
  process.stdout.write(`${receipt.verdict} ${receiptPath}\n`);
  if (receipt.verdict === "FAIL" || receipt.verdict === "BLOCKED") {
    process.exitCode = 1;
  }
};

const readReceipt = (receiptPath: string) => {
  const file = path.resolve(repositoryRoot, receiptPath);
  return {
    directory: path.dirname(file),
    receipt: Schema.decodeUnknownSync(Schema.fromJsonString(ProofReceipt))(
      readFileSync(file, "utf-8")
    ),
  };
};

const assertUnchanged = (
  directory: string,
  file: string,
  expected: string,
  label: string
) => {
  const absolute = path.join(directory, file);
  if (!existsSync(absolute)) {
    fail(`Receipt ${label} is missing: ${file}`);
  }
  if (sha256(readFileSync(absolute)) !== expected) {
    fail(`Receipt ${label} changed after capture: ${file}`);
  }
};

const verifyReceipt = async (receiptPath: string): Promise<ProofReceipt> => {
  const config = await loadConfig();
  const { directory, receipt } = readReceipt(receiptPath);
  const head = git(["rev-parse", "HEAD"]);
  if (receipt.headSha !== head) {
    fail(`Receipt head ${receipt.headSha} does not match HEAD ${head}`);
  }
  if (receipt.patchId !== patchId(receipt.base.sha, head)) {
    fail("Receipt patch ID no longer matches the checked-out change");
  }
  const changedFiles = changedFilesBetween(receipt.base.sha, head);
  const violations = validateReceiptSemantics(receipt, {
    changedFiles,
    gates: config.gates,
    minimumRiskTier: classifyChangedFiles(config, changedFiles),
    requiresVisualEvidence: requiresVisualEvidence(config, changedFiles),
  });
  if (violations.length > 0) {
    fail(`Receipt is inconsistent: ${violations.join("; ")}`);
  }
  for (const command of [...receipt.commands, ...receipt.focusedChecks]) {
    assertUnchanged(directory, command.logPath, command.sha256, "command log");
  }
  for (const artifact of receipt.artifacts) {
    assertUnchanged(directory, artifact.path, artifact.sha256, "artifact");
  }
  const report = path.join(directory, "report.md");
  if (
    !existsSync(report) ||
    readFileSync(report, "utf-8") !== renderProofReport(receipt)
  ) {
    fail("Proof report does not match the verified receipt");
  }
  return receipt;
};

const doctor = (): void => {
  git(["rev-parse", "--show-toplevel"]);
  process.stdout.write("PASS git repository\n");
  run("gh", ["auth", "status"], repositoryRoot);
  process.stdout.write("PASS GitHub authentication\n");
  if (
    !run("gh", ["pr", "comment", "--help"], repositoryRoot).includes("--attach")
  ) {
    fail("GitHub CLI with `pr comment --attach` is required to publish media");
  }
  process.stdout.write("PASS GitHub media attachments\n");
};

const PullRequestState = Schema.Struct({
  baseRefOid: Schema.String,
  comments: Schema.Array(Schema.Struct({ body: Schema.String })),
  headRefOid: Schema.String,
});

const publish = async (args: readonly string[]): Promise<void> => {
  const pr = flag(args, "--pr") ?? fail("--pr is required");
  const receiptPath = flag(args, "--receipt") ?? fail("--receipt is required");
  const receipt = await verifyReceipt(receiptPath);
  if (receipt.verdict !== "PASS" && receipt.verdict !== "PASS_WITH_NOTES") {
    fail(`Only passing proof can be published; receipt is ${receipt.verdict}`);
  }
  doctor();
  const state = Schema.decodeUnknownSync(
    Schema.fromJsonString(PullRequestState)
  )(
    run(
      "gh",
      ["pr", "view", pr, "--json", "baseRefOid,comments,headRefOid"],
      repositoryRoot
    )
  );
  if (
    state.headRefOid !== receipt.headSha ||
    state.baseRefOid !== receipt.base.sha
  ) {
    fail("PR head or base moved since the proof was captured; re-prove.");
  }
  const marker = `<!-- proofed-delivery:${receipt.headSha} -->`;
  if (state.comments.some((comment) => comment.body.includes(marker))) {
    fail("Proof for this PR revision is already published");
  }
  const { directory } = readReceipt(receiptPath);
  const command = [
    "pr",
    "comment",
    pr,
    "--body-file",
    path.join(directory, "report.md"),
  ];
  for (const artifact of receipt.artifacts) {
    command.push(
      "--attach",
      githubAttachmentArgument(path.join(directory, artifact.path), artifact)
    );
  }
  execFileSync("gh", command, { cwd: repositoryRoot, stdio: "inherit" });
};

const USAGE = `Usage:
  bun run proof -- doctor
  bun run proof -- run [--base origin/main] [--risk auto|low|medium|high|critical] [--flow text] [--artifact path#alt]
                       [--focused-check name::command] [--note text] [--rollback text]
                       [--verifier-verdict PASS --verifier-summary text --verifier-source id]
  bun run proof -- verify --receipt .artifacts/proofs/<dir>/receipt.json
  bun run proof -- publish --pr <number> --receipt .artifacts/proofs/<dir>/receipt.json
`;

const main = async (): Promise<void> => {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case "doctor": {
      doctor();
      return;
    }
    case "run": {
      await runProof(args);
      return;
    }
    case "verify": {
      const receipt = await verifyReceipt(
        flag(args, "--receipt") ?? fail("--receipt is required")
      );
      process.stdout.write(
        `PASS proof matches ${receipt.headSha} (${receipt.verdict})\n`
      );
      return;
    }
    case "publish": {
      await publish(args);
      return;
    }
    case undefined: {
      process.stdout.write(USAGE);
      return;
    }
    default: {
      process.stdout.write(USAGE);
      process.exitCode = 1;
    }
  }
};

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `ERROR ${error instanceof Error ? error.message : String(error)}\n`
    );
    process.exitCode = 1;
  }
}
