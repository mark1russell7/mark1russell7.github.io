import { type ReactElement, useEffect, useMemo, useRef } from "react";
import { CAPTION_HEIGHT, FRAME_HEIGHT, FRAME_WIDTH, PlateCard } from "../cards.tsx";
import type { ConceptProps } from "../concept.ts";
import { hueRgb, type Item, itemById, items } from "../content.ts";
import { type Box, PHONE_WIDTH, plateSize, random, relax } from "../layout.ts";
import { ease, useLoop, useSize } from "../loop.ts";
import { Fluid } from "./fluid.ts";
import { Water } from "./water.ts";

/** The place of each item in the pond, as a part of the width and the height. The layout then removes the overlaps. */
const homes: Record<string, [number, number]> = {
  me: [0.12, 0.24],
  vex: [0.37, 0.3],
  "async-browser-context": [0.66, 0.32],
  lag: [0.9, 0.22],
  "page-lifecycle-tracker": [0.52, 0.08],
  proof: [0.1, 0.66],
  client: [0.3, 0.74],
  render: [0.53, 0.78],
  systems: [0.76, 0.73],
  now: [0.93, 0.58],
  meter: [0.95, 0.9],
  "ste-lint": [0.25, 0.04],
  optional: [0.78, 0.04],
  cue: [0.06, 0.95],
  "otel-ts": [0.3, 0.97],
  template: [0.98, 0.42],
};

/** The order of the cards in the column of the phone layout. The pebbles follow in two columns. */
const phoneOrder = ["me", "vex", "async-browser-context", "lag", "client", "render", "systems", "page-lifecycle-tracker", "proof", "now", "meter"];

/** A box of the layout, with the scale of its card from the base size. */
interface Placed extends Box {
  readonly item: Item;
  readonly k: number;
}

interface Body extends Placed {
  readonly hx: number;
  readonly hy: number;
  readonly rgb: [number, number, number];
  readonly delay: number;
  vx: number;
  vy: number;
  rot: number;
  hover: number;
}

interface Plan {
  readonly boxes: Placed[];
  /** The height of the content. On a phone, the content is taller than the screen, and the pond scrolls. */
  readonly height: number;
  readonly phone: boolean;
}

function desktopLayout(width: number, height: number): Plan {
  const area = items.reduce((sum, item) => {
    const size = plateSize(item);
    return sum + size.w * size.h;
  }, 0);
  const scale = Math.min(1.15, Math.max(0.5, Math.sqrt((0.5 * width * height) / area)));
  const boxes: Placed[] = items.map((item) => {
    const size = plateSize(item);
    const [fx, fy] = homes[item.id] ?? [0.5, 0.5];
    return { id: item.id, item, k: scale, x: fx * width, y: fy * height, w: size.w * scale, h: size.h * scale };
  });
  relax(boxes, width, height, 18 * scale, 20, 400);
  return { boxes, height, phone: false };
}

function phoneLayout(width: number): Plan {
  const margin = 16;
  const gap = 18;
  const column = width - margin * 2;
  const boxes: Placed[] = [];
  let y = margin;
  for (const id of phoneOrder) {
    const item = itemById(id);
    if (!item) continue;
    const base = plateSize(item);
    // On a phone, each site has the full width and a caption at the normal size.
    const k = item.kind === "site" ? 1 : column / base.w;
    const h = item.kind === "site" ? (column * FRAME_HEIGHT) / FRAME_WIDTH + CAPTION_HEIGHT : base.h * k;
    boxes.push({ id, item, k, x: width / 2, y: y + h / 2, w: column, h });
    y += h + gap;
  }
  const small = (column - 12) / 2;
  items
    .filter((item) => item.kind === "pebble")
    .forEach((item, index) => {
      if (index % 2 === 0 && index > 0) y += 58 + 12;
      const x = margin + (index % 2) * (small + 12) + small / 2;
      boxes.push({ id: item.id, item, k: 1, x, y: y + 29, w: small, h: 58 });
    });
  return { boxes, height: y + 58 + margin + 40, phone: true };
}

/**
 * The pond: a fluid fills the page, and the cards float on it. The current carries the cards, and springs pull them back to their places.
 * The cursor stirs the water. The cards push the water when they move.
 * On a phone, the cards make a column that scrolls over the water. The scroll moves the cards through the water, and a tap makes a splash.
 */
export function Pond({ onOpen, reduced, paused }: ConceptProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = useSize(rootRef);
  const plan = useMemo(() => (width === 0 ? null : width < PHONE_WIDTH ? phoneLayout(width) : desktopLayout(width, height)), [width, height]);
  const elements = useRef(new Map<string, HTMLElement>());
  const state = useRef<{ fluid: Fluid; water: Water | null; bodies: Body[]; start: number; nextAmbient: number } | null>(null);
  const pointer = useRef({ x: 0, y: 0, px: 0, py: 0, inside: false, down: false, splash: false });
  const scroll = useRef({ top: 0, speed: 0 });

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
      const spread = plan.phone ? 40 : 120;
      const start = reduced ? { x: box.x, y: box.y } : { x: box.x + (random(index) - 0.5) * spread, y: box.y + 120 + random(index + 50) * 80 };
      return {
        ...box,
        hx: box.x,
        hy: box.y,
        x: start.x,
        y: start.y,
        rgb: hueRgb(box.item.hue),
        delay: reduced ? 0 : 0.1 + Math.min(index, 8) * 0.045,
        vx: 0,
        vy: reduced ? 0 : -160,
        rot: 0,
        hover: 0,
      };
    });
    if (!reduced) {
      for (const body of bodies) {
        if (body.hy < height) fluid.splat(body.hx, body.hy + 40, 0, -320, 70 * Math.min(1, body.k), body.rgb, 0.9);
      }
    }
    scroll.current = { top: scrollRef.current?.scrollTop ?? 0, speed: 0 };
    state.current = { fluid, water, bodies, start: performance.now(), nextAmbient: 6 };
  }, [plan, width, height, reduced]);

  useLoop((dt, now) => {
    const sim = state.current;
    if (!sim || !plan || paused) return;
    const t = (now - sim.start) / 1000;
    const { fluid, bodies } = sim;
    const p = pointer.current;

    // The scroll of the phone layout. The cards move through the water at the speed of the scroll.
    const top = scrollRef.current?.scrollTop ?? 0;
    const scrollSpeed = dt > 0 ? (top - scroll.current.top) / dt : 0;
    scroll.current.speed += (scrollSpeed - scroll.current.speed) * 0.5;
    scroll.current.top = top;

    // The hovered card: the card under the pointer, or the card with the keyboard focus.
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>("[data-id]")?.dataset["id"] : undefined;
    let hovered: Body | undefined = bodies.find((b) => b.item.id === focused);
    if (!hovered && p.inside && !plan.phone) {
      for (let k = bodies.length - 1; k >= 0; k--) {
        const b = bodies[k]!;
        if (Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.y + top - b.y) < b.h / 2) {
          hovered = b;
          break;
        }
      }
    }

    if (!reduced) {
      // The pointer stirs the water. Its dye has the color of the nearest card.
      let nearest = bodies[0]!;
      let best = Infinity;
      for (const b of bodies) {
        const d = Math.hypot(b.x - p.x, b.y - top - p.y);
        if (d < best) {
          best = d;
          nearest = b;
        }
      }
      const mx = p.x - p.px;
      const my = p.y - p.py;
      if (p.inside && (mx !== 0 || my !== 0) && dt > 0) {
        const speed = Math.min(2400, Math.hypot(mx, my) / dt);
        const scale = speed / Math.hypot(mx, my);
        fluid.splat(p.x, p.y, mx * scale * 0.28, my * scale * 0.28, p.down ? 64 : 44, nearest.rgb, p.down ? 1 : 0.7);
      }
      if (p.splash) {
        // A tap makes a ring of waves.
        p.splash = false;
        for (let a = 0; a < 6; a++) {
          const angle = (a / 6) * Math.PI * 2;
          fluid.splat(p.x + Math.cos(angle) * 12, p.y + Math.sin(angle) * 12, Math.cos(angle) * 420, Math.sin(angle) * 420, 34, nearest.rgb, 0.6);
        }
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
      if (reduced || t < b.delay) continue;
      const screenY = b.y - top;
      flow.x = 0;
      flow.y = 0;
      if (screenY > -b.h && screenY < height + b.h) {
        for (const [ox, oy] of [
          [0, 0],
          [-0.35, -0.3],
          [0.35, -0.3],
          [-0.35, 0.3],
          [0.35, 0.3],
        ] as const) {
          fluid.sample(b.x + ox * b.w, screenY + oy * b.h, sample);
          flow.x += sample.x / 5;
          // The water moves relative to the screen, and the scroll moves the cards relative to the screen.
          flow.y += (sample.y + scroll.current.speed) / 5;
        }
      }
      const stiffness = (plan.phone ? 8 : 5) + 40 * b.hover;
      const drag = (plan.phone ? 1.4 : 2.2) * (1 - b.hover);
      b.vx += (stiffness * (b.hx - b.x) + drag * (flow.x - b.vx)) * dt;
      b.vy += (stiffness * (b.hy - b.y) + drag * (flow.y - b.vy) * (plan.phone ? 0.4 : 1)) * dt;
      const damping = Math.exp(-(1.1 + 9 * b.hover) * dt);
      b.vx *= damping;
      b.vy *= damping;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    if (!reduced) {
      // The cards do not overlap. The hovered card does not move, and it pushes the cards near it away.
      for (let n = 0; n < 2; n++) {
        for (let a = 0; a < bodies.length; a++) {
          for (let c = a + 1; c < bodies.length; c++) {
            const p1 = bodies[a]!;
            const p2 = bodies[c]!;
            const gap = (plan.phone ? 6 : 10) + 30 * Math.max(p1.hover, p2.hover);
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
        const minX = b.w / 2 + (plan.phone ? 2 : 6);
        const minY = b.h / 2 + 6;
        if (b.x < minX || b.x > width - minX) b.vx *= -0.4;
        if (b.y < minY || b.y > plan.height - minY) b.vy *= -0.4;
        b.x = Math.min(width - minX, Math.max(minX, b.x));
        b.y = Math.min(plan.height - minY, Math.max(minY, b.y));
        const screenY = b.y - top;
        if (t > b.delay && screenY > -b.h && screenY < height + b.h) {
          fluid.solid(b.x - b.w / 2, screenY - b.h / 2, b.w, b.h, b.vx, b.vy - scroll.current.speed, 0.5);
        }
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
    const locate = (event: PointerEvent): void => {
      const rect = root.getBoundingClientRect();
      pointer.current.x = event.clientX - rect.left;
      pointer.current.y = event.clientY - rect.top;
    };
    const move = (event: PointerEvent): void => {
      const p = pointer.current;
      locate(event);
      if (!p.inside) {
        p.px = p.x;
        p.py = p.y;
      }
      // On a phone, a finger scrolls the column. Only a mouse or a pen stirs the water when it moves.
      p.inside = event.pointerType !== "touch";
    };
    const leave = (): void => {
      pointer.current.inside = false;
      pointer.current.down = false;
    };
    const down = (event: PointerEvent): void => {
      locate(event);
      pointer.current.px = pointer.current.x;
      pointer.current.py = pointer.current.y;
      if (event.pointerType !== "touch") {
        pointer.current.down = true;
      } else if (!(event.target instanceof Element && event.target.closest("a, button, article"))) {
        pointer.current.splash = true;
      }
    };
    const up = (): void => {
      pointer.current.down = false;
    };
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("pointercancel", leave);
    root.addEventListener("pointerdown", down);
    addEventListener("pointerup", up);
    return () => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("pointercancel", leave);
      root.removeEventListener("pointerdown", down);
      removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <div className="concept pond" ref={rootRef}>
      <canvas ref={canvasRef} className="pond-water" aria-hidden="true" />
      <div className={plan?.phone ? "pond-scroll is-phone" : "pond-scroll"} ref={scrollRef}>
        <div className="pond-content" style={{ height: plan?.height ?? 0 }}>
          {plan
            ? plan.boxes.map((box) => (
                <PlateCard
                  key={box.id}
                  item={box.item}
                  width={box.w}
                  height={box.h}
                  scale={box.k}
                  onOpen={onOpen}
                  className="floating"
                  style={{ transform: `translate3d(${box.x - box.w / 2}px, ${box.y - box.h / 2}px, 0)`, opacity: reduced ? 1 : 0 }}
                  cardRef={(element) => {
                    if (element) elements.current.set(box.id, element);
                    else elements.current.delete(box.id);
                  }}
                />
              ))
            : null}
        </div>
      </div>
    </div>
  );
}
