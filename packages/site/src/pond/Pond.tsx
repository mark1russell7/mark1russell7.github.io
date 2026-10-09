import { type ReactElement, useEffect, useMemo, useRef } from "react";
import { PlateCard } from "../cards.tsx";
import { hueRgb, type Item, items } from "../content.ts";
import { type Box, plateSize, random, relax } from "../layout.ts";
import { ease, useLoop, useSize } from "../loop.ts";
import type { ConceptProps } from "../concept.ts";
import { Fluid } from "./fluid.ts";
import { Water } from "./water.ts";

/** The place of each item in the pond, as a part of the width and the height. The layout then removes the overlaps. */
const homes: Record<string, [number, number]> = {
  me: [0.12, 0.2],
  vex: [0.37, 0.3],
  "async-browser-context": [0.66, 0.32],
  lag: [0.9, 0.22],
  proof: [0.1, 0.62],
  client: [0.3, 0.74],
  render: [0.53, 0.78],
  systems: [0.76, 0.73],
  now: [0.93, 0.58],
  craft: [0.5, 0.06],
  meter: [0.95, 0.9],
  "ste-lint": [0.25, 0.04],
  optional: [0.78, 0.04],
  cue: [0.06, 0.95],
  "otel-ts": [0.28, 0.97],
  "page-lifecycle-tracker": [0.55, 0.98],
  template: [0.98, 0.42],
};

interface Body extends Box {
  readonly item: Item;
  readonly hx: number;
  readonly hy: number;
  readonly rgb: [number, number, number];
  readonly delay: number;
  vx: number;
  vy: number;
  rot: number;
  hover: number;
}

function layout(width: number, height: number): { scale: number; boxes: Box[] } {
  const area = items.reduce((sum, item) => {
    const size = plateSize(item);
    return sum + size.w * size.h;
  }, 0);
  const scale = Math.min(1.15, Math.max(0.5, Math.sqrt((0.5 * width * height) / area)));
  const boxes: Box[] = items.map((item) => {
    const size = plateSize(item);
    const [fx, fy] = homes[item.id] ?? [0.5, 0.5];
    return { id: item.id, x: fx * width, y: fy * height, w: size.w * scale, h: size.h * scale };
  });
  relax(boxes, width, height, 18 * scale, 20, 400);
  return { scale, boxes };
}

/**
 * The pond: a fluid fills the page, and the cards float on it. The current carries the cards, and springs pull them back to their places.
 * The cursor stirs the water. The cards push the water when they move.
 */
export function Pond({ onOpen, reduced, paused }: ConceptProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = useSize(rootRef);
  const plan = useMemo(() => (width > 0 ? layout(width, height) : null), [width, height]);
  const elements = useRef(new Map<string, HTMLElement>());
  const state = useRef<{ fluid: Fluid; water: Water | null; bodies: Body[]; start: number; nextAmbient: number } | null>(null);
  const pointer = useRef({ x: 0, y: 0, px: 0, py: 0, inside: false, down: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!plan || !canvas) return;
    // The water is soft, so a canvas at a lower resolution looks the same and costs less.
    const ratio = 0.6;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const fluid = new Fluid(width, height, Math.max(8, width / 150));
    const water = Water.create(canvas, fluid);
    const bodies: Body[] = plan.boxes.map((box, index) => {
      const item = items[index]!;
      const start = reduced ? { x: box.x, y: box.y } : { x: box.x + (random(index) - 0.5) * 120, y: box.y + 120 + random(index + 50) * 80 };
      return {
        ...box,
        item,
        hx: box.x,
        hy: box.y,
        x: start.x,
        y: start.y,
        rgb: hueRgb(item.hue),
        delay: reduced ? 0 : 0.1 + index * 0.045,
        vx: 0,
        vy: reduced ? 0 : -160,
        rot: 0,
        hover: 0,
      };
    });
    if (!reduced) {
      for (const body of bodies) fluid.splat(body.hx, body.hy + 40, 0, -320, 70 * plan.scale, body.rgb, 0.9);
    }
    state.current = { fluid, water, bodies, start: performance.now(), nextAmbient: 6 };
  }, [plan, width, height, reduced]);

  useLoop((dt, now) => {
    const sim = state.current;
    if (!sim || paused) return;
    const t = (now - sim.start) / 1000;
    const { fluid, bodies } = sim;
    const p = pointer.current;

    // The hovered card: the card under the pointer, or the card with the keyboard focus.
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>("[data-id]")?.dataset["id"] : undefined;
    let hovered: Body | undefined = bodies.find((b) => b.item.id === focused);
    if (!hovered && p.inside) {
      for (let k = bodies.length - 1; k >= 0; k--) {
        const b = bodies[k]!;
        if (Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.y - b.y) < b.h / 2) {
          hovered = b;
          break;
        }
      }
    }

    if (!reduced) {
      // The pointer stirs the water. Its dye has the color of the nearest card.
      const mx = p.x - p.px;
      const my = p.y - p.py;
      if (p.inside && (mx !== 0 || my !== 0) && dt > 0) {
        let nearest = bodies[0]!;
        let best = Infinity;
        for (const b of bodies) {
          const d = Math.hypot(b.x - p.x, b.y - p.y);
          if (d < best) {
            best = d;
            nearest = b;
          }
        }
        const speed = Math.min(2400, Math.hypot(mx, my) / dt);
        const scale = speed > 0 ? speed / Math.hypot(mx, my) : 0;
        fluid.splat(p.x, p.y, mx * scale * 0.28, my * scale * 0.28, p.down ? 64 : 44, nearest.rgb, p.down ? 1 : 0.7);
      }
      p.px = p.x;
      p.py = p.y;

      // A slow current starts from an edge from time to time, so the pond never stops.
      if (t > sim.nextAmbient) {
        sim.nextAmbient = t + 5 + random(t) * 4;
        const fromLeft = random(t + 1) < 0.5;
        const y = (0.2 + random(t + 2) * 0.6) * height;
        const body = bodies[Math.floor(random(t + 3) * bodies.length)]!;
        fluid.splat(fromLeft ? 30 : width - 30, y, fromLeft ? 520 : -520, (random(t + 4) - 0.5) * 200, 90, body.rgb, 0.35);
      }
    }

    const flow = { x: 0, y: 0 };
    const sample = { x: 0, y: 0 };
    for (const b of bodies) {
      const target = b === hovered ? 1 : 0;
      b.hover += (target - b.hover) * (1 - Math.exp(-10 * dt));
      if (reduced) continue;
      if (t < b.delay) continue;
      flow.x = 0;
      flow.y = 0;
      for (const [ox, oy] of [
        [0, 0],
        [-0.35, -0.3],
        [0.35, -0.3],
        [-0.35, 0.3],
        [0.35, 0.3],
      ] as const) {
        fluid.sample(b.x + ox * b.w, b.y + oy * b.h, sample);
        flow.x += sample.x / 5;
        flow.y += sample.y / 5;
      }
      const stiffness = 5 + 40 * b.hover;
      const drag = 2.2 * (1 - b.hover);
      b.vx += (stiffness * (b.hx - b.x) + drag * (flow.x - b.vx)) * dt;
      b.vy += (stiffness * (b.hy - b.y) + drag * (flow.y - b.vy)) * dt;
      const damping = Math.exp(-(1.1 + 9 * b.hover) * dt);
      b.vx *= damping;
      b.vy *= damping;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    // The cards do not overlap. The hovered card does not move, and it pushes the cards near it away.
    if (!reduced) {
      for (let n = 0; n < 2; n++) {
        for (let a = 0; a < bodies.length; a++) {
          for (let c = a + 1; c < bodies.length; c++) {
            const p1 = bodies[a]!;
            const p2 = bodies[c]!;
            const gap = 10 + 30 * Math.max(p1.hover, p2.hover);
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const ox = (p1.w + p2.w) / 2 + gap - Math.abs(dx);
            const oy = (p1.h + p2.h) / 2 + gap - Math.abs(dy);
            if (ox <= 0 || oy <= 0) continue;
            const w1 = p1 === hovered ? 0 : p2 === hovered ? 1 : (p2.w * p2.h) / (p1.w * p1.h + p2.w * p2.h);
            const w2 = 1 - w1;
            if (ox / (p1.w + p2.w) < oy / (p1.h + p2.h)) {
              const s = dx < 0 ? -1 : 1;
              p1.x -= ox * w1 * s * 0.5;
              p2.x += ox * w2 * s * 0.5;
              const rv = p2.vx - p1.vx;
              if (rv * s < 0) {
                p1.vx += rv * w1;
                p2.vx -= rv * w2;
              }
            } else {
              const s = dy < 0 ? -1 : 1;
              p1.y -= oy * w1 * s * 0.5;
              p2.y += oy * w2 * s * 0.5;
              const rv = p2.vy - p1.vy;
              if (rv * s < 0) {
                p1.vy += rv * w1;
                p2.vy -= rv * w2;
              }
            }
          }
        }
      }
      for (const b of bodies) {
        const minX = b.w / 2 + 6;
        const minY = b.h / 2 + 6;
        if (b.x < minX || b.x > width - minX) b.vx *= -0.4;
        if (b.y < minY || b.y > height - minY) b.vy *= -0.4;
        b.x = Math.min(width - minX, Math.max(minX, b.x));
        b.y = Math.min(height - minY, Math.max(minY, b.y));
        if (t > b.delay) fluid.solid(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, b.vx, b.vy, 0.5);
      }
      fluid.step(dt, { vorticity: 9, velocityDecay: 0.3, dyeDecay: 0.12, iterations: 12, smooth: 0.18 });
    }
    if (!reduced || t < 0.1) sim.water?.draw(t);

    for (const b of bodies) {
      const element = elements.current.get(b.item.id);
      if (!element) continue;
      const appear = reduced ? 1 : ease((t - b.delay) / 0.7);
      b.rot += (Math.max(-4, Math.min(4, b.vx * 0.012)) - b.rot) * (1 - Math.exp(-6 * dt));
      const scale = (0.9 + 0.1 * appear) * (1 + 0.04 * b.hover);
      element.style.transform = `translate3d(${(b.x - b.w / 2).toFixed(2)}px, ${(b.y - b.h / 2).toFixed(2)}px, 0) rotate(${b.rot.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
      element.style.opacity = appear.toFixed(3);
      element.style.zIndex = b.hover > 0.05 ? "5" : "";
    }
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const move = (event: PointerEvent): void => {
      const rect = root.getBoundingClientRect();
      const p = pointer.current;
      p.x = event.clientX - rect.left;
      p.y = event.clientY - rect.top;
      if (!p.inside) {
        p.px = p.x;
        p.py = p.y;
      }
      p.inside = true;
    };
    const leave = (): void => {
      pointer.current.inside = false;
      pointer.current.down = false;
    };
    const down = (): void => {
      pointer.current.down = true;
    };
    const up = (): void => {
      pointer.current.down = false;
    };
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("pointerdown", down);
    addEventListener("pointerup", up);
    return () => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("pointerdown", down);
      removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <div className="concept pond" ref={rootRef}>
      <canvas ref={canvasRef} className="pond-water" aria-hidden="true" />
      {plan
        ? items.map((item, index) => {
            const box = plan.boxes[index]!;
            return (
              <PlateCard
                key={item.id}
                item={item}
                width={box.w}
                height={box.h}
                scale={plan.scale}
                onOpen={onOpen}
                className="floating"
                style={{ transform: `translate3d(${box.x - box.w / 2}px, ${box.y - box.h / 2}px, 0)`, opacity: reduced ? 1 : 0 }}
                cardRef={(element) => {
                  if (element) elements.current.set(item.id, element);
                  else elements.current.delete(item.id);
                }}
              />
            );
          })
        : null}
    </div>
  );
}
