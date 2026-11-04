import { describe, expect, it, vi } from "vitest";
import { LiveFrames } from "./live.ts";

describe("the live frames", () => {
  it("starts with no live card", () => {
    expect(new LiveFrames(1).isLive("a")).toBe(false);
  });

  it("keeps only the newest card at the limit of one", () => {
    const frames = new LiveFrames(1);
    frames.claim("a");
    frames.claim("b");
    expect(frames.isLive("a")).toBe(false);
    expect(frames.isLive("b")).toBe(true);
  });

  it("unloads a card that the user leaves", () => {
    const frames = new LiveFrames(1);
    frames.claim("a");
    frames.release("a");
    expect(frames.isLive("a")).toBe(false);
  });

  it("does not unload a newer card when an older card lets go", () => {
    const frames = new LiveFrames(1);
    frames.claim("a");
    frames.claim("b");
    frames.release("a");
    expect(frames.isLive("b")).toBe(true);
  });

  it("gives each card its frame at no limit", () => {
    const frames = new LiveFrames(Number.POSITIVE_INFINITY);
    expect(frames.isLive("a")).toBe(true);
    frames.release("a");
    expect(frames.isLive("a")).toBe(true);
  });

  it("gives no card a frame at the limit of zero", () => {
    const frames = new LiveFrames(0);
    frames.claim("a");
    expect(frames.isLive("a")).toBe(false);
  });

  it("tells a listener only about a change", () => {
    const frames = new LiveFrames(1);
    const listener = vi.fn();
    const stop = frames.subscribe(listener);
    frames.claim("a");
    frames.claim("a");
    frames.release("b");
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    frames.release("a");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
