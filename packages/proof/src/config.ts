/**
 * Per-repository proof policy: which paths raise the risk tier, which paths
 * change something a visitor sees, and the canonical gate commands. Lives in
 * `proof.config.ts` at the repository root.
 */
import type { RiskTier } from "./core.ts";

export interface ProofGate {
  /** argv, run from the repository root. */
  readonly command: readonly string[];
}

export interface ProofConfig {
  /** First matching tier wins, checked from critical down; unmatched paths are low risk. */
  readonly risk: Readonly<Record<Exclude<RiskTier, "low">, readonly RegExp[]>>;
  /** Paths whose change needs an image or video of the rendered surface. */
  readonly visual: readonly RegExp[];
  /** Matching paths never require visual evidence (tests, fixtures). */
  readonly visualExempt: readonly RegExp[];
  /** Always run first; `build` runs too for anything above low risk. */
  readonly gates: { readonly ci: ProofGate; readonly build: ProofGate };
}

export const defineProofConfig = (config: ProofConfig): ProofConfig => config;
