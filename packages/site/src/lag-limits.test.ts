import { describe, expect, it } from "vitest";
import { CONTROL_MS, type LagRound, type LagValues, LIMITS, blockingOf, controlHolds, judgeLag, lagPasses } from "./lag-limits.ts";

const HEALTHY: LagValues = { tbtAll: 220, longestAll: 240, frames: 1, nodes: 570, lcp: 900 };

/** The rounds of one route, the same in the two arms, with a change of the values of one arm. */
function roundsOf(route: string, values: Partial<LagValues> = {}, arm: Partial<LagValues> = {}, count = 6): LagRound[] {
  return Array.from({ length: count }, (_, round) => [
    { ...HEALTHY, ...values, route, round, arm: "a" as const },
    { ...HEALTHY, ...values, ...arm, route, round, arm: "b" as const },
  ]).flat();
}

const outcome = (rounds: readonly LagRound[], measure: string): string | undefined => judgeLag(rounds).find((v) => v.measure === measure)?.verdict.outcome;

describe("blockingOf", () => {
  it("counts the time above 50 ms of each task in the window", () => {
    expect(blockingOf([{ at: 100, dur: 120 }, { at: 300, dur: 60 }], 50, 1000)).toEqual({ tbtAll: 80, longestAll: 120 });
  });

  it("keeps a task that ends after the first paint", () => {
    expect(blockingOf([{ at: 0, dur: 500 }], 400, 1000)).toEqual({ tbtAll: 450, longestAll: 500 });
  });

  it("drops a task that ends before the first paint, and a task after the end", () => {
    expect(blockingOf([{ at: 0, dur: 300 }, { at: 1500, dur: 300 }], 400, 1000)).toEqual({ tbtAll: 0, longestAll: 0 });
  });

  it("gives 0 with no tasks", () => {
    expect(blockingOf([], 400, 1000)).toEqual({ tbtAll: 0, longestAll: 0 });
  });
});

describe("judgeLag", () => {
  it("passes a healthy run, a route with no long task included", () => {
    const rounds = [...roundsOf("pond"), ...roundsOf("board", { tbtAll: 0, longestAll: 0, nodes: 2071 })];
    expect(judgeLag(rounds).map((v) => v.verdict.outcome)).toEqual(["within", "within", "within", "within"]);
    expect(lagPasses(judgeLag(rounds))).toBe(true);
  });

  it("fails a route above a limit, and it names the route", () => {
    const rounds = [...roundsOf("board"), ...roundsOf("pond", { tbtAll: 600 })];
    const verdict = judgeLag(rounds).find((v) => v.measure === "tbtAll")?.verdict;
    expect(verdict?.outcome).toBe("beyond");
    expect(verdict?.reason).toContain('"pond"');
    expect(lagPasses(judgeLag(rounds))).toBe(false);
  });

  it("uses a limit for each of the four measures", () => {
    for (const [measure, value] of [["longestAll", 451], ["frames", 3], ["nodes", 5001]] as const) {
      expect(outcome(roundsOf("pond", { [measure]: value }), measure)).toBe("beyond");
    }
  });

  it("does not pass a run with noise between the two arms", () => {
    const rounds = roundsOf("pond", { tbtAll: 100 }, { tbtAll: 400 });
    expect(outcome(rounds, "tbtAll")).toBe("cannot decide");
    expect(lagPasses(judgeLag(rounds))).toBe(false);
  });

  it("does not pass a run with too few rounds, or with no rounds", () => {
    expect(lagPasses(judgeLag(roundsOf("pond", {}, {}, 5)))).toBe(false);
    expect(lagPasses(judgeLag([]))).toBe(false);
    expect(lagPasses([])).toBe(false);
  });

  it("has no limit on the largest paint", () => {
    expect(Object.keys(LIMITS)).not.toContain("lcp");
    expect(lagPasses(judgeLag(roundsOf("pond", { lcp: 60000 })))).toBe(true);
  });
});

describe("controlHolds", () => {
  it("needs the task of the control round in the two values", () => {
    expect(controlHolds({ tbtAll: CONTROL_MS - 50, longestAll: CONTROL_MS })).toBe(true);
    expect(controlHolds({ tbtAll: 0, longestAll: 0 })).toBe(false);
    expect(controlHolds({ tbtAll: CONTROL_MS, longestAll: CONTROL_MS - 1 })).toBe(false);
  });

  it("has a task above each time limit, so a control round cannot pass the limits", () => {
    expect(CONTROL_MS).toBeGreaterThan(LIMITS.tbtAll.limit);
    expect(CONTROL_MS).toBeGreaterThan(LIMITS.longestAll.limit);
  });
});
