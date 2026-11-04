import { afterEach, describe, expect, it, vi } from "vitest";
import { afterPaint, FrameMeter } from "./loop.ts";

/** This function records frames at a fixed interval, and gives the time of the last frame. */
function run(meter: FrameMeter, start: number, frames: number, intervalMs: number): number {
  let now = start;
  for (let frame = 0; frame < frames; frame++) {
    now += intervalMs;
    meter.record(1, now);
  }
  return now;
}

describe("the frame meter", () => {
  it("gives the rate of steady frames", () => {
    const meter = new FrameMeter();
    run(meter, 1000, 300, 20);
    expect(meter.fps).toBeCloseTo(50, 1);
  });

  it("counts a frame of 250 ms or more", () => {
    const meter = new FrameMeter();
    run(meter, 1000, 300, 1000);
    expect(meter.fps).toBeCloseTo(1, 1);
  });

  it("gives the slow frames their time when fast frames surround them", () => {
    const meter = new FrameMeter();
    let now = 1000;
    for (let round = 0; round < 200; round++) {
      now = run(meter, now, 9, 16);
      now = run(meter, now, 1, 856);
    }
    // The 10 frames take 1000 ms, so the true rate is 10 in each second.
    expect(meter.fps).toBeLessThan(20);
  });

  it("ignores the gap of a hidden tab", () => {
    const meter = new FrameMeter();
    const now = run(meter, 1000, 300, 20);
    meter.record(1, now + 60_000);
    expect(meter.fps).toBeCloseTo(50, 1);
  });
});

/** This function replaces the browser functions of `afterPaint`, and gives the queues of the test. */
function fakePage(readyState: string, idle: boolean): { load: (() => void)[]; frames: (() => void)[]; idles: { run: () => void; timeout: number }[] } {
  const page = { load: [] as (() => void)[], frames: [] as (() => void)[], idles: [] as { run: () => void; timeout: number }[] };
  vi.stubGlobal("document", { readyState });
  vi.stubGlobal("addEventListener", (_: string, run: () => void) => page.load.push(run));
  vi.stubGlobal("removeEventListener", (_: string, run: () => void) => page.load.splice(page.load.indexOf(run), 1));
  vi.stubGlobal("requestAnimationFrame", (run: () => void) => page.frames.push(run));
  vi.stubGlobal("requestIdleCallback", idle ? (run: () => void, options: { timeout: number }) => page.idles.push({ run, timeout: options.timeout }) : undefined);
  return page;
}

describe("afterPaint", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("waits for the load event, two frames and an idle moment", () => {
    const page = fakePage("loading", true);
    let runs = 0;
    afterPaint(() => runs++);
    expect(page.load).toHaveLength(1);
    expect(page.frames).toHaveLength(0);
    page.load[0]?.();
    page.frames.shift()?.();
    expect(page.idles).toHaveLength(0);
    page.frames.shift()?.();
    expect(page.idles).toHaveLength(1);
    expect(runs).toBe(0);
    page.idles[0]?.run();
    expect(runs).toBe(1);
  });

  it("does not wait for a load event that has passed", () => {
    const page = fakePage("complete", true);
    afterPaint(() => undefined);
    expect(page.load).toHaveLength(0);
    expect(page.frames).toHaveLength(1);
  });

  it("limits the wait for an idle moment, so a busy page starts the work", () => {
    const page = fakePage("complete", true);
    afterPaint(() => undefined);
    page.frames.shift()?.();
    page.frames.shift()?.();
    expect(page.idles[0]?.timeout).toBe(1000);
  });

  it("uses a timer in a browser with no idle callback", () => {
    vi.useFakeTimers();
    const page = fakePage("complete", false);
    let runs = 0;
    afterPaint(() => runs++);
    page.frames.shift()?.();
    page.frames.shift()?.();
    vi.runAllTimers();
    expect(runs).toBe(1);
  });

  it("starts nothing after a cancel", () => {
    const page = fakePage("complete", true);
    let runs = 0;
    const cancel = afterPaint(() => runs++);
    page.frames.shift()?.();
    cancel();
    page.frames.shift()?.();
    expect(page.idles).toHaveLength(0);
    expect(runs).toBe(0);
  });

  it("removes its load listener after a cancel", () => {
    const page = fakePage("loading", true);
    const cancel = afterPaint(() => undefined);
    cancel();
    expect(page.load).toHaveLength(0);
  });
});
