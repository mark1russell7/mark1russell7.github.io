/**
 * The lag limits of the site: the numbers of the claim and the judgment of one run. The script `scripts/lag-budget.ts`
 * drives the pages, and the verdict comes from `@mark1russell7/rigor-bench`. The site does not import this file.
 */
import { type BudgetRound, type BudgetVerdict, budgetVerdict } from "@mark1russell7/rigor-bench";

/** The routes of the claim. A route opens no site, so it has no live frame. */
export const ROUTES = ["pond", "river", "board"] as const;

/** The rounds of each arm. The level 0.95 of the verdict needs 6 rounds or more. */
export const ROUNDS = 6;

/** The time of the task of the control round, in milliseconds. It is above each time limit. */
export const CONTROL_MS = 800;

/** A long task starts to block input after this time, in milliseconds. */
const BLOCKING_AFTER_MS = 50;

/** The values of one page load. */
export interface LagValues {
  /** The sum of the time above 50 ms of each long task, in milliseconds. */
  readonly tbtAll: number;
  /** The time of the longest task, in milliseconds. */
  readonly longestAll: number;
  /** The count of frames of the page. The page itself counts as 1. */
  readonly frames: number;
  /** The count of nodes of the document. */
  readonly nodes: number;
  /** The time of the largest paint, in milliseconds. This value has no limit in CI. */
  readonly lcp: number;
}

/** One page load of one route in one arm. The two arms load the same build. */
export interface LagRound extends LagValues {
  readonly route: string;
  readonly round: number;
  readonly arm: "a" | "b";
}

/** The four measures with a limit. */
export type LagMeasure = "tbtAll" | "longestAll" | "frames" | "nodes";

/**
 * The limit and the largest A/A difference of each measure, as the median of the rounds on a phone profile of 360 px
 * and four times slower CPU. The runner has no GPU, so a frame rate has no limit here.
 */
export const LIMITS: Readonly<Record<LagMeasure, { readonly limit: number; readonly maxDifference: number }>> = {
  tbtAll: { limit: 450, maxDifference: 200 },
  longestAll: { limit: 450, maxDifference: 200 },
  frames: { limit: 2, maxDifference: 1 },
  nodes: { limit: 5000, maxDifference: 500 },
};

/** One long task, with the start time in milliseconds from the start of the page. */
export interface LagTask {
  readonly at: number;
  readonly dur: number;
}

/**
 * This function gives the blocking time and the longest task in a window. A task that starts before the first paint and
 * ends after it blocks the page, so the window keeps it.
 */
export function blockingOf(tasks: readonly LagTask[], firstPaint: number, end: number): Pick<LagValues, "tbtAll" | "longestAll"> {
  const blocking = tasks.filter((task) => task.at + task.dur >= firstPaint && task.at <= end);
  return {
    tbtAll: Math.round(blocking.reduce((sum, task) => sum + Math.max(0, task.dur - BLOCKING_AFTER_MS), 0)),
    longestAll: Math.round(Math.max(0, ...blocking.map((task) => task.dur))),
  };
}

/** The verdict of one measure. */
export interface LagVerdict {
  readonly measure: LagMeasure;
  readonly verdict: BudgetVerdict;
}

/** This function gives the rounds of one arm for one measure. */
function armOf(rounds: readonly LagRound[], arm: LagRound["arm"], measure: LagMeasure): BudgetRound[] {
  return rounds.filter((r) => r.arm === arm).map((r) => ({ case: r.route, round: r.round, value: r[measure] }));
}

/** This function gives the verdict of each measure with a limit. */
export function judgeLag(rounds: readonly LagRound[]): LagVerdict[] {
  return (Object.keys(LIMITS) as LagMeasure[]).map((measure) => ({ measure, verdict: budgetVerdict(armOf(rounds, "a", measure), armOf(rounds, "b", measure), LIMITS[measure]) }));
}

/** This function gives true only when each verdict is `within`. A claim that a run cannot decide is not proved. */
export function lagPasses(verdicts: readonly LagVerdict[]): boolean {
  return verdicts.length > 0 && verdicts.every((v) => v.verdict.outcome === "within");
}

/** This function gives true when the measure saw the task of the control round, so the run can fail. */
export function controlHolds(control: Pick<LagValues, "tbtAll" | "longestAll">): boolean {
  return control.longestAll >= CONTROL_MS && control.tbtAll >= CONTROL_MS - BLOCKING_AFTER_MS;
}
