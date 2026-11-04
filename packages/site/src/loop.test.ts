import { describe, expect, it } from "vitest";
import { FrameMeter } from "./loop.ts";

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
