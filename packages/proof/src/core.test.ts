import { describe, expect, it } from "vitest";

import { defineProofConfig } from "./config.ts";
import {
  classifyChangedFiles,
  deriveVerdict,
  renderProofReport,
  requiresVisualEvidence,
  validateReceiptSemantics,
} from "./core.ts";
import type { ProofCommand, ProofReceipt } from "./core.ts";

const config = defineProofConfig({
  gates: {
    build: { command: ["bun", "run", "build"] },
    ci: { command: ["bun", "run", "ci"] },
  },
  risk: {
    critical: [/^\.github\/workflows\//u],
    high: [/alchemy\.run\.ts$/u],
    medium: [/^apps\//u],
  },
  visual: [/^apps\/[^/]+\/src\/.+\.(?:astro|tsx|css)$/u],
  visualExempt: [/\.test\.tsx?$/u],
});

const gate = (name: string, status: "pass" | "fail"): ProofCommand => ({
  command: name === "ci" ? "bun run ci" : "bun run build",
  durationMs: 10,
  exitCode: status === "pass" ? 0 : 1,
  logPath: `logs/${name}.log`,
  name,
  sha256: "a".repeat(64),
  status,
});

const receipt = (overrides: Partial<ProofReceipt> = {}): ProofReceipt => {
  const base: ProofReceipt = {
    artifacts: [
      {
        alt: "Home at 375px",
        kind: "image",
        path: "artifacts/home.png",
        sha256: "b".repeat(64),
      },
    ],
    base: { ref: "origin/main", sha: "base" },
    changedFiles: ["apps/site/src/pages/index.astro"],
    commands: [gate("ci", "pass"), gate("build", "pass")],
    createdAt: "2026-10-05T00:00:00.000Z",
    flows: ["Home renders"],
    focusedChecks: [],
    headSha: "head",
    independentVerification: null,
    notes: [],
    patchId: "patch",
    requiresVisualEvidence: true,
    riskTier: "medium",
    rollback: null,
    schemaVersion: 1,
    verdict: "PASS",
  };
  return { ...base, ...overrides };
};

describe(classifyChangedFiles, () => {
  it("takes the highest tier any path needs", () => {
    expect(classifyChangedFiles(config, ["README.md"])).toBe("low");
    expect(classifyChangedFiles(config, ["README.md", "apps/x/a.ts"])).toBe(
      "medium"
    );
    expect(
      classifyChangedFiles(config, [
        "apps/x/alchemy.run.ts",
        ".github/workflows/ci.yml",
      ])
    ).toBe("critical");
  });
});

describe(requiresVisualEvidence, () => {
  it("needs media for visible source but not for tests", () => {
    expect(requiresVisualEvidence(config, ["apps/x/src/a.astro"])).toBeTruthy();
    expect(
      requiresVisualEvidence(config, ["apps/x/src/a.test.tsx"])
    ).toBeFalsy();
  });
});

describe(deriveVerdict, () => {
  it("passes complete evidence", () => {
    expect(deriveVerdict(receipt())).toBe("PASS");
  });

  it("fails on a failed gate and blocks on missing evidence", () => {
    expect(deriveVerdict(receipt({ commands: [gate("ci", "fail")] }))).toBe(
      "FAIL"
    );
    expect(deriveVerdict(receipt({ artifacts: [] }))).toBe("BLOCKED");
    expect(deriveVerdict(receipt({ riskTier: "high" }))).toBe("BLOCKED");
  });

  it("downgrades to notes when limitations are recorded", () => {
    expect(deriveVerdict(receipt({ notes: ["Admin not exercised"] }))).toBe(
      "PASS_WITH_NOTES"
    );
  });
});

describe(validateReceiptSemantics, () => {
  const facts = {
    changedFiles: ["apps/site/src/pages/index.astro"],
    gates: config.gates,
    minimumRiskTier: "medium" as const,
    requiresVisualEvidence: true,
  };

  it("accepts a consistent receipt", () => {
    expect(validateReceiptSemantics(receipt(), facts)).toStrictEqual([]);
  });

  it("catches a lowered risk tier and an inflated verdict", () => {
    const violations = validateReceiptSemantics(
      receipt({
        artifacts: [],
        commands: [gate("ci", "pass")],
        riskTier: "low",
      }),
      facts
    );
    expect(violations).toContain(
      "risk tier is lower than the changed paths require"
    );
    expect(violations).toContain("verdict contradicts the recorded evidence");
  });
});

describe(renderProofReport, () => {
  it("embeds the revision marker publish uses to avoid duplicates", () => {
    expect(renderProofReport(receipt())).toContain(
      "<!-- proofed-delivery:head -->"
    );
  });
});
