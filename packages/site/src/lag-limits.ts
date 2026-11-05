/**
 * The lag limits of the site: the numbers of the claim and the judgment of one run. The script `scripts/lag-budget.ts`
 * drives the pages, and the verdict comes from `@mark1russell7/rigor-bench`. The site does not import this file.
 */
import { BUDGET_LOOKS, type BudgetLooksVerdict, type BudgetRound, budgetLooksVerdict } from "@mark1russell7/rigor-bench";

/** The routes of the claim. A route opens no site, so it has no live frame. */
export const ROUTES = ["pond", "river", "board"] as const;

/** The first rounds of each arm of each route. */
export const FIRST_ROUNDS = BUDGET_LOOKS[0]?.rounds ?? 6;

/** The budget: the most rounds of each arm of a route. The looks of `BUDGET_LOOKS` stop here. */
export const LAST_ROUNDS = BUDGET_LOOKS.at(-1)?.rounds ?? 24;

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
 * The limit and the largest A/A difference of each measure. Each value is the median of the rounds on a phone profile:
 * 360 px, with a CPU four times slower. The runner has no GPU, so a frame rate has no limit here.
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
  readonly verdict: BudgetLooksVerdict;
}

/** This function gives the rounds of one arm for one measure. */
function armOf(rounds: readonly LagRound[], arm: LagRound["arm"], measure: LagMeasure): BudgetRound[] {
  return rounds.filter((r) => r.arm === arm).map((r) => ({ case: r.route, round: r.round, value: r[measure] }));
}

/** This function gives the verdict of each measure with a limit. */
export function judgeLag(rounds: readonly LagRound[]): LagVerdict[] {
  return (Object.keys(LIMITS) as LagMeasure[]).map((measure) => ({ measure, verdict: budgetLooksVerdict(armOf(rounds, "a", measure), armOf(rounds, "b", measure), LIMITS[measure]) }));
}

/**
 * This function gives true when each verdict is final and no interval is above the limit. A final `cannot decide` passes,
 * and `lagUndecided` names it for the record. A run with no rounds does not pass.
 */
export function lagPasses(verdicts: readonly LagVerdict[]): boolean {
  return verdicts.length > 0 && verdicts.every((v) => v.verdict.cases.length > 0 && v.verdict.more.length === 0 && !v.verdict.fails);
}

/** This function gives the rounds that each route needs next, over all measures. The map is empty when the run is final. */
export function lagMore(verdicts: readonly LagVerdict[]): Map<string, number> {
  const more = new Map<string, number>();
  for (const { verdict } of verdicts) {
    for (const { case: route, rounds } of verdict.more) more.set(route, Math.max(more.get(route) ?? 0, rounds));
  }
  return more;
}

/** One measure of one route with no outcome at the end of its rounds. */
export interface LagUndecided {
  readonly measure: LagMeasure;
  readonly route: string;
  readonly reason: string;
}

/** This function gives each pair of a measure and a route with no outcome. A run gives this list after its last look. */
export function lagUndecided(verdicts: readonly LagVerdict[]): LagUndecided[] {
  return verdicts.flatMap(({ measure, verdict }) => verdict.cases.filter((c) => c.outcome === "cannot decide").map((c) => ({ measure, route: c.case, reason: c.reason })));
}

/** The stamp of a run: what the run spent and what it did not prove. */
export interface LagStamp {
  /** The most rounds of each arm of a route. */
  readonly budget: number;
  /** The rounds of each arm at each look. */
  readonly looks: readonly number[];
  /** The count of pairs of a measure and a route with no outcome. */
  readonly undecided: number;
}

/** This function gives the stamp of a run. */
export function lagStamp(verdicts: readonly LagVerdict[]): LagStamp {
  return { budget: LAST_ROUNDS, looks: BUDGET_LOOKS.map((look) => look.rounds), undecided: lagUndecided(verdicts).length };
}

/**
 * This function gives the plain words for each pair with no outcome. The pair passes, and its limit stays not proved, so
 * the words say both.
 */
export function lagUndecidedLines(undecided: readonly LagUndecided[]): string[] {
  if (undecided.length === 0) return [];
  return [
    `Cannot decide: ${undecided.length}. After ${LAST_ROUNDS} rounds, the interval of each pair below still holds its limit. The run passes, but it does not prove these limits.`,
    "",
    ...undecided.map((u) => `- ${u.measure} of ${u.route}: ${u.reason}`),
  ];
}

/** This function gives true when the measure saw the task of the control round, so the run can fail. */
export function controlHolds(control: Pick<LagValues, "tbtAll" | "longestAll">): boolean {
  return control.longestAll >= CONTROL_MS && control.tbtAll >= CONTROL_MS - BLOCKING_AFTER_MS;
}
