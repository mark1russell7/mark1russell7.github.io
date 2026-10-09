import { type ReactElement, useEffect, useMemo, useRef } from "react";
import { PlateCard } from "../cards.tsx";
import type { ConceptProps } from "../concept.ts";
import { type Item, itemById } from "../content.ts";
import { plateSize, random } from "../layout.ts";
import { ease, useLoop, useSize } from "../loop.ts";

/** Each lane is a depth. A far lane is higher on the screen, smaller and slower. */
const lanes: readonly { readonly ids: readonly string[]; readonly depth: number; readonly y: number; readonly speed: number }[] = [
  { ids: ["ste-lint", "optional", "cue", "otel-ts", "template"], depth: 0.74, y: 0.13, speed: 0.5 },
  { ids: ["lag", "proof", "client", "page-lifecycle-tracker", "render", "meter", "systems"], depth: 0.8, y: 0.4, speed: 0.72 },
  { ids: ["me", "vex", "now", "async-browser-context"], depth: 1, y: 0.73, speed: 1 },
];

/** The speed of the front lane, in pixels for each second. */
const CURRENT = 52;
const PARTICLES = 650;

interface Floater {
  readonly item: Item;
  readonly lane: number;
  readonly w: number;
  readonly h: number;
  readonly scale: number;
  readonly phase: number;
  x: number;
  y: number;
  vy: number;
}

interface Plan {
  readonly floaters: Floater[];
  readonly lengths: number[];
  readonly scale: number;
}

function plan(width: number, height: number): Plan {
  // The largest card of the front lane fills 38% of the height, but not more than 82% of the width, so it fits on a phone.
  const scale = Math.min(1.25, Math.max(0.45, Math.min((height * 0.38) / 320, (width * 0.82) / 420)));
  const floaters: Floater[] = [];
  const lengths: number[] = [];
  lanes.forEach((lane, index) => {
    const members = lane.ids.map((id) => itemById(id)).filter((item): item is Item => item !== undefined);
    const sizes = members.map((item) => {
      const size = plateSize(item);
      return { w: size.w * lane.depth * scale, h: size.h * lane.depth * scale };
    });
    const gap = 70 * lane.depth * scale;
    const natural = sizes.reduce((sum, size) => sum + size.w + gap, 0);
    const widest = Math.max(...sizes.map((size) => size.w));
    const length = Math.max(natural, width + widest + gap);
    const spare = (length - natural) / members.length;
    lengths.push(length);
    let x = width * 0.12 + index * 90;
    members.forEach((item, k) => {
      const size = sizes[k]!;
      floaters.push({ item, lane: index, w: size.w, h: size.h, scale: lane.depth * scale, phase: random(k + index * 10) * Math.PI * 2, x: x + size.w / 2, y: lane.y * height, vy: 0 });
      x += size.w + gap + spare;
    });
  });
  return { floaters, lengths, scale };
}

/** This function gives the y of the center line of a lane at `x`. The line bends like a river. */
function laneY(lane: number, x: number, t: number, height: number): number {
  const base = (lanes[lane]?.y ?? 0.5) * height;
  return base + Math.sin(x / 260 + t * 0.25 + lane * 1.7) * height * 0.025;
}

/**
 * This function gives the velocity of the current at a point. A rock at `rock` turns the current around it: this is the potential flow
 * around a cylinder. The current flows to the left.
 */
function flow(x: number, y: number, speed: number, rock: { x: number; y: number; r: number } | null, out: { x: number; y: number }): void {
  out.x = -speed;
  out.y = 0;
  if (!rock || rock.r <= 0) return;
  const dx = x - rock.x;
  const dy = y - rock.y;
  const r2 = dx * dx + dy * dy;
  const R2 = rock.r * rock.r;
  if (r2 < R2) {
    // Inside the rock, the water goes out of the rock.
    const r = Math.sqrt(r2) || 1;
    out.x = (dx / r) * speed * 1.5;
    out.y = (dy / r) * speed * 1.5;
    return;
  }
  const r4 = r2 * r2;
  out.x = -speed * (1 - (R2 * (dx * dx - dy * dy)) / r4);
  out.y = (speed * 2 * R2 * dx * dy) / r4;
}

/**
 * The river: the cards float to the left in three lanes. The pointer is a rock, and the current and the cards go around it.
 * The card under the pointer stops, and it is the rock.
 */
export function River({ onOpen, reduced, paused }: ConceptProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { width, height } = useSize(rootRef);
  const layout = useMemo(() => (width > 0 ? plan(width, height) : null), [width, height]);
  const elements = useRef(new Map<string, HTMLElement>());
  const pointer = useRef({ x: 0, y: 0, inside: false, down: false });
  /** A drag moves the river. A drag of more than a few pixels is not a click on a card. */
  const drag = useRef<{ x: number; moved: number } | null>(null);
  const scroll = useRef(0);
  const speed = useRef(reduced ? 0 : 8);
  const start = useRef(performance.now());
  const particles = useMemo(() => {
    const out = new Float32Array(PARTICLES * 2);
    for (let i = 0; i < PARTICLES; i++) {
      out[i * 2] = random(i) * Math.max(1, width);
      out[i * 2 + 1] = random(i + 999) * Math.max(1, height);
    }
    return out;
  }, [width, height]);

  useEffect(() => {
    start.current = performance.now();
    speed.current = reduced ? 0 : 8;
  }, [layout, reduced]);

  useLoop((dt, now) => {
    if (paused || !layout) return;
    const t = (now - start.current) / 1000;
    const p = pointer.current;
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.closest<HTMLElement>("[data-id]")?.dataset["id"] : undefined;

    // The speed of the river: fast at the start, slow when the pointer is on the river, and zero when the user holds the river.
    const goal = reduced || p.down ? 0 : p.inside ? 0.45 : 1;
    speed.current += (goal - speed.current) * (1 - Math.exp(-(t < 1.6 ? 2.2 : 3) * dt));

    let hovered: Floater | null = layout.floaters.find((f) => f.item.id === focused) ?? null;
    if (!hovered && p.inside) {
      for (const f of layout.floaters) {
        if (Math.abs(p.x - f.x) < f.w / 2 && Math.abs(p.y - f.y) < f.h / 2) hovered = f;
      }
    }
    const rock = hovered
      ? { x: hovered.x, y: hovered.y, r: Math.hypot(hovered.w, hovered.h) * 0.42 }
      : p.inside && !reduced
        ? { x: p.x, y: p.y, r: 70 }
        : null;

    const velocity = { x: 0, y: 0 };
    const shift = scroll.current;
    scroll.current = 0;
    for (const f of layout.floaters) {
      const lane = lanes[f.lane]!;
      const length = layout.lengths[f.lane]!;
      if (f === hovered) {
        f.vy *= Math.exp(-8 * dt);
      } else {
        const local = rock ? { x: rock.x, y: rock.y, r: rock.r + Math.min(f.w, f.h) * 0.45 } : null;
        flow(f.x, f.y, CURRENT * lane.speed * speed.current, local, velocity);
        f.x += velocity.x * dt;
        const spring = (laneY(f.lane, f.x, t, height) - f.y) * 2.2;
        f.vy += (velocity.y * 1.6 + spring - f.vy * 1.8) * dt * 2;
        f.y += f.vy * dt;
      }
      f.x -= shift * lane.speed;
      if (f.x < -f.w / 2 - 40) f.x += length;
      if (f.x > length - f.w / 2 - 40) f.x -= length;
    }

    // The cards in one lane keep a gap. A card that stops makes the cards behind it wait.
    for (let lane = 0; lane < lanes.length; lane++) {
      const members = layout.floaters.filter((f) => f.lane === lane);
      const length = layout.lengths[lane]!;
      for (let n = 0; n < 2; n++) {
        for (let a = 0; a < members.length; a++) {
          for (let b = a + 1; b < members.length; b++) {
            const f1 = members[a]!;
            const f2 = members[b]!;
            let dx = f2.x - f1.x;
            if (dx > length / 2) dx -= length;
            if (dx < -length / 2) dx += length;
            const overlapX = (f1.w + f2.w) / 2 + 24 - Math.abs(dx);
            const overlapY = (f1.h + f2.h) / 2 + 12 - Math.abs(f2.y - f1.y);
            if (overlapX <= 0 || overlapY <= 0) continue;
            const s = dx < 0 ? -1 : 1;
            const w1 = f1 === hovered ? 0 : f2 === hovered ? 1 : 0.5;
            f1.x -= overlapX * w1 * s;
            f2.x += overlapX * (1 - w1) * s;
          }
        }
      }
    }

    for (const f of layout.floaters) {
      const element = elements.current.get(f.item.id);
      if (!element) continue;
      const appear = reduced ? 1 : ease((t - f.lane * 0.15) / 0.8);
      const tilt = Math.max(-3, Math.min(3, f.vy * 0.04));
      element.style.transform = `translate3d(${(f.x - f.w / 2).toFixed(2)}px, ${(f.y - f.h / 2).toFixed(2)}px, 0) rotate(${tilt.toFixed(2)}deg)`;
      element.style.opacity = (appear * (f.lane === 0 ? 0.85 : 1)).toFixed(3);
      element.style.zIndex = f === hovered ? "8" : String(f.lane + 1);
    }

    drawCurrent(canvasRef.current, particles, width, height, speed.current, rock, dt, t);
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const move = (event: PointerEvent): void => {
      const rect = root.getBoundingClientRect();
      pointer.current.x = event.clientX - rect.left;
      pointer.current.y = event.clientY - rect.top;
      pointer.current.inside = true;
      const current = drag.current;
      if (current) {
        scroll.current += current.x - event.clientX;
        current.moved += Math.abs(current.x - event.clientX);
        current.x = event.clientX;
      }
    };
    const leave = (): void => {
      pointer.current.inside = false;
      pointer.current.down = false;
    };
    const down = (event: PointerEvent): void => {
      drag.current = { x: event.clientX, moved: 0 };
      if (event.target instanceof Element && event.target.closest("a, button")) return;
      pointer.current.down = true;
    };
    const up = (): void => {
      pointer.current.down = false;
      const current = drag.current;
      drag.current = null;
      if (current && current.moved > 6) {
        // The click that follows the drag does not open a card.
        const block = (event: MouseEvent): void => {
          event.preventDefault();
          event.stopPropagation();
        };
        root.addEventListener("click", block, { capture: true, once: true });
        setTimeout(() => root.removeEventListener("click", block, { capture: true }), 0);
      }
    };
    const wheel = (event: WheelEvent): void => {
      event.preventDefault();
      scroll.current += (Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY) * (event.deltaMode === 1 ? 16 : 1);
    };
    root.addEventListener("pointermove", move);
    root.addEventListener("pointerleave", leave);
    root.addEventListener("pointerdown", down);
    root.addEventListener("wheel", wheel, { passive: false });
    addEventListener("pointerup", up);
    return () => {
      root.removeEventListener("pointermove", move);
      root.removeEventListener("pointerleave", leave);
      root.removeEventListener("pointerdown", down);
      root.removeEventListener("wheel", wheel);
      removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <div className="concept river" ref={rootRef}>
      <canvas ref={canvasRef} className="river-current" width={Math.round(width)} height={Math.round(height)} aria-hidden="true" />
      {layout
        ? layout.floaters.map((f) => (
            <PlateCard
              key={f.item.id}
              item={f.item}
              width={f.w}
              height={f.h}
              scale={f.scale}
              onOpen={onOpen}
              className={`floating river-lane-${f.lane}`}
              style={{ transform: `translate3d(${f.x - f.w / 2}px, ${f.y - f.h / 2}px, 0)`, opacity: reduced ? 1 : 0 }}
              cardRef={(element) => {
                if (element) elements.current.set(f.item.id, element);
                else elements.current.delete(f.item.id);
              }}
            />
          ))
        : null}
    </div>
  );
}

/**
 * This function draws the current as short streaks of foam that follow the flow. The old streaks fade, so each streak leaves a trail.
 * The speed of the water is lower at the top of the screen, because the top is farther away.
 */
function drawCurrent(
  canvas: HTMLCanvasElement | null,
  particles: Float32Array,
  width: number,
  height: number,
  speed: number,
  rock: { x: number; y: number; r: number } | null,
  dt: number,
  t: number,
): void {
  const ctx = canvas?.getContext("2d");
  if (!canvas || !ctx || width === 0) return;
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = `rgba(0, 0, 0, ${Math.min(1, dt * 3.2)})`;
  ctx.fillRect(0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  ctx.strokeStyle = "rgba(200, 232, 226, 0.34)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  const v = { x: 0, y: 0 };
  for (let i = 0; i < particles.length; i += 2) {
    const x = particles[i]!;
    const y = particles[i + 1]!;
    const depth = 0.45 + 0.55 * (y / height);
    flow(x, y, CURRENT * depth * speed * 1.4, rock, v);
    const wobble = Math.sin(x / 90 + t * 0.6 + i) * 4 * speed;
    const nx = x + v.x * dt;
    const ny = y + (v.y + wobble) * dt;
    ctx.moveTo(x, y);
    ctx.lineTo(nx, ny);
    if (nx < -4 || nx > width + 40 || ny < -4 || ny > height + 4 || random(i + t) < 0.002) {
      particles[i] = width + random(i * 3 + t) * 30;
      particles[i + 1] = random(i * 7 + t) * height;
    } else {
      particles[i] = nx;
      particles[i + 1] = ny;
    }
  }
  ctx.stroke();
}
