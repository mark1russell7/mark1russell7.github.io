import { type RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

/** The frame meter records the work time of each animation frame of the pool. */
export class FrameMeter {
  /** The work time of the last frames, in milliseconds. */
  readonly samples: Float32Array = new Float32Array(90);
  private index = 0;
  private lastFrame = 0;
  /** The frames in each second, smoothed. */
  fps = 60;

  /** This method records one frame. */
  record(workMs: number, now: number): void {
    this.samples[this.index] = workMs;
    this.index = (this.index + 1) % this.samples.length;
    if (this.lastFrame > 0) {
      const interval = now - this.lastFrame;
      if (interval > 0 && interval < 250) this.fps += (1000 / interval - this.fps) * 0.05;
    }
    this.lastFrame = now;
  }

  /** This method gives the samples from the oldest to the newest. */
  ordered(): number[] {
    const out: number[] = [];
    for (let k = 0; k < this.samples.length; k++) out.push(this.samples[(this.index + k) % this.samples.length] ?? 0);
    return out;
  }
}

export const meter: FrameMeter = new FrameMeter();

/**
 * This hook uses `step` one time in each animation frame. The time `dt` is in seconds, and the hook limits it to 50 ms.
 * The frame meter records the time that `step` uses.
 */
export function useLoop(step: (dt: number, now: number) => void): void {
  const ref = useRef(step);
  useLayoutEffect(() => {
    ref.current = step;
  });
  useEffect(() => {
    let id = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      const start = performance.now();
      ref.current(dt, now);
      meter.record(performance.now() - start, now);
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
}

/** This hook gives true when the user asks for reduced motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const change = (): void => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  return reduced;
}

/** This hook gives the size of an element, and it updates the size when the element changes. */
export function useSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(() => {
      const rect = element.getBoundingClientRect();
      setSize((old) =>
        Math.abs(old.width - rect.width) < 1 && Math.abs(old.height - rect.height) < 1 ? old : { width: rect.width, height: rect.height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/** This function gives a value from 0 to 1, with a smooth start and a smooth end. */
export function ease(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}
