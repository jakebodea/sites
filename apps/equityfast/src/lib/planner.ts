/**
 * Renovation planner math. A project's equity gain is its budget times its
 * return (national average cost-vs-value plus three years of appreciation,
 * entered in the CMS as a percentage of cost).
 */
export interface PlannedProject {
  /** Return as a percentage of cost: 327 means $1 spent adds $3.27. */
  readonly roiPercent: number;
  readonly budget: number;
}

export interface PlanTotals {
  readonly budget: number;
  readonly gain: number;
  readonly aboveCost: number;
  /** Total gain over total budget (1.5 = 150%), or undefined with nothing planned. */
  readonly blendedReturn: number | undefined;
  readonly count: number;
}

export const projectGain = (project: PlannedProject): number =>
  Math.round((project.budget * project.roiPercent) / 100);

export const planTotals = (projects: readonly PlannedProject[]): PlanTotals => {
  const active = projects.filter((project) => project.budget > 0);
  const budget = active.reduce((sum, project) => sum + project.budget, 0);
  const gain = active.reduce((sum, project) => sum + projectGain(project), 0);
  return {
    aboveCost: gain - budget,
    blendedReturn: budget > 0 ? gain / budget : undefined,
    budget,
    count: active.length,
    gain,
  };
};

/** Slider ceiling: at least $50,000, or three times the typical budget. */
export const budgetCeiling = (typicalBudget: number): number =>
  Math.max(50_000, typicalBudget * 3);
