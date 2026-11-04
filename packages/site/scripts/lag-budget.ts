// This script checks the lag limits of a built site. It loads each route in a fresh browser, in two arms of the same
// build, on a phone profile. The numbers and the judgment are in src/lag-limits.ts. Only CI starts it, because other
// load on a computer makes these times wrong.
//   LAG_BASE   the address of the preview server, by default http://localhost:4173
//   LAG_OUT    the folder of the records, by default lag-budget
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { firstArm } from "@mark1russell7/rigor-bench";
import { chromium } from "playwright";
import { CONTROL_MS, LIMITS, type LagRound, type LagTask, type LagValues, ROUNDS, ROUTES, blockingOf, controlHolds, judgeLag, lagPasses } from "../src/lag-limits.ts";

const BASE = (process.env["LAG_BASE"] ?? "http://localhost:4173").replace(/\/$/, "");
const OUT = process.env["LAG_OUT"] ?? "lag-budget";
const VIEWPORT = { width: 360, height: 780 };
const CPU_RATE = 4;
const LOAD_LIMIT_MS = 90000;
/** The page gets this time after its load event, so the water and the late tasks are in the window. */
const SETTLE_MS = 5000;
/** The runner has no GPU. These arguments give a software renderer for WebGL. */
const ARGS = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"];
/** The task of the control round starts after this time, before the end of the window of a load. */
const CONTROL_AT_MS = 3000;

/** This script keeps the long tasks, the paints and the largest paint of the top document. */
const OBSERVE = `(() => {
  if (window.top !== window) return;
  const seen = (window.__lag = { tasks: [], fcp: null, lcp: null });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) seen.tasks.push({ at: e.startTime, dur: e.duration });
  }).observe({ type: "longtask", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (e.name === "first-contentful-paint") seen.fcp = e.startTime;
  }).observe({ type: "paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) seen.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
})();`;

/** This script blocks the main thread one time, so the control round shows that the measure sees a long task. */
const CONTROL = `(() => {
  if (window.top !== window) return;
  setTimeout(() => {
    const start = performance.now();
    while (performance.now() - start < ${CONTROL_MS});
  }, ${CONTROL_AT_MS});
})();`;

/** This script reads the page at the end of the window. */
const READ = `({ ...window.__lag, now: performance.now(), places: document.querySelectorAll(".concept [data-id]").length })`;

interface PageRead {
  readonly tasks: readonly LagTask[];
  readonly fcp: number | null;
  readonly lcp: number | null;
  readonly now: number;
  readonly places: number;
}

/** This function loads one route in a fresh browser. It throws when the page did not paint or did not show the route. */
async function load(route: string, control = false): Promise<LagValues> {
  const browser = await chromium.launch({ channel: "chromium", headless: true, args: ARGS });
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
    await page.addInitScript({ content: OBSERVE });
    if (control) await page.addInitScript({ content: CONTROL });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Performance.enable");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_RATE });
    await page.goto(`${BASE}/#${route}`, { waitUntil: "load", timeout: LOAD_LIMIT_MS });
    await page.waitForTimeout(SETTLE_MS);
    const { metrics } = await cdp.send("Performance.getMetrics");
    const seen = await page.evaluate<PageRead>(READ);
    const nodes = metrics.find((m) => m.name === "Nodes")?.value;
    if (errors.length > 0) throw new Error(`the page ${route} has errors: ${errors.join("; ")}`);
    if (seen.fcp === null || seen.lcp === null) throw new Error(`the page ${route} has no paint.`);
    if (seen.places === 0) throw new Error(`the page ${route} shows no places of its view.`);
    if (nodes === undefined) throw new Error("the browser gives no count of nodes.");
    return { ...blockingOf(seen.tasks, seen.fcp, seen.now), frames: page.frames().length, nodes, lcp: Math.round(seen.lcp) };
  } finally {
    await browser.close();
  }
}

/** This function gives one line of the table of the verdicts. */
function row(measure: string, limit: number, outcome: string, cases: readonly { case: string; median: number; aaMedian: number | undefined; high: number; outcome: string }[]): string {
  const values = cases.map((c) => `${c.case} ${c.median} (A/A ${c.aaMedian ?? "none"}, high ${c.high})`).join(", ");
  return `| ${measure} | ${limit} | ${outcome} | ${values} |`;
}

// A first load fills the file cache of the computer, so the first round of the first arm pays no more than the others.
await load(ROUTES[0]);

const rounds: LagRound[] = [];
for (const [index, route] of ROUTES.entries()) {
  for (let round = 0; round < ROUNDS; round++) {
    const first = firstArm(round, index);
    for (const arm of first === "a" ? (["a", "b"] as const) : (["b", "a"] as const)) {
      const values = await load(route);
      rounds.push({ route, round, arm, ...values });
      console.log(`${route} ${round} ${arm}: ${JSON.stringify(values)}`);
    }
  }
}
const control = await load(ROUTES[0], true);
const verdicts = judgeLag(rounds);
const seesTask = controlHolds(control);
const passed = seesTask && lagPasses(verdicts);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "lag-budget.json"), `${JSON.stringify({ limits: LIMITS, rounds, control, verdicts, passed }, null, 2)}\n`);

const text = [
  `### Lag limits: ${passed ? "passed" : "failed"}`,
  "",
  `The median of ${ROUNDS} rounds in each arm, at ${VIEWPORT.width} px, with a CPU ${CPU_RATE} times slower. Only the outcome \`within\` passes.`,
  "",
  "| Measure | Limit | Outcome | Medians |",
  "| --- | ---: | --- | --- |",
  ...verdicts.map(({ measure, verdict }) => row(measure, verdict.limit, verdict.outcome, verdict.cases)),
  "",
  `The control round has a task of ${CONTROL_MS} ms. The measure read ${control.longestAll} ms, so the control ${seesTask ? "holds" : "does not hold"}.`,
  "",
  ...verdicts.filter((v) => v.verdict.outcome !== "within").map((v) => `- ${v.measure}: ${v.verdict.reason}`),
].join("\n");
console.log(text);
if (process.env["GITHUB_STEP_SUMMARY"]) appendFileSync(process.env["GITHUB_STEP_SUMMARY"], `${text}\n`);
if (!passed) process.exitCode = 1;
