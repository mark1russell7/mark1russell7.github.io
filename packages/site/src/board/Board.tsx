import { type CSSProperties, type MouseEvent, type PointerEvent, type ReactElement, useEffect, useRef, useState } from "react";
import { PlateCard } from "../cards.tsx";
import type { ConceptProps } from "../concept.ts";
import { itemById, items } from "../content.ts";
import { useLoop, useSize } from "../loop.ts";

/** The place and the size of each item on the board, in world units. */
const places: Record<string, readonly [number, number, number, number]> = {
  me: [0, 0, 420, 300],
  vex: [500, 0, 880, 637],
  "async-browser-context": [1460, 0, 880, 637],
  now: [2420, 0, 420, 300],
  proof: [0, 380, 420, 300],
  craft: [2420, 380, 420, 228],
  lag: [20, 717, 640, 487],
  client: [720, 717, 640, 487],
  render: [1440, 717, 640, 487],
  systems: [2160, 717, 640, 487],
  meter: [0, 1284, 420, 270],
  "ste-lint": [500, 1284, 360, 96],
  optional: [888, 1284, 360, 96],
  cue: [1276, 1284, 360, 96],
  "otel-ts": [1664, 1284, 360, 96],
  "page-lifecycle-tracker": [2052, 1284, 400, 96],
  template: [2480, 1284, 360, 96],
};

const WORLD = { width: 2840, height: 1554 };
const MIN_ZOOM = 0.12;
const MAX_ZOOM = 3;
const HUD = 64;

interface Camera {
  x: number;
  y: number;
  z: number;
}

function placeOf(id: string): readonly [number, number, number, number] {
  return places[id] ?? [0, 0, 100, 100];
}

/** This function gives the camera that shows the rectangle in the viewport, with a margin. */
function frame(x: number, y: number, w: number, h: number, width: number, height: number, fill: number): Camera {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((width * fill) / w, ((height - HUD) * fill) / h)));
  return { x: x + w / 2, y: y + h / 2 - HUD / 2 / z, z };
}

/**
 * The board: an infinite canvas with each item at a fixed place. Drag to move the board, and scroll to zoom.
 * When the user selects a site, the camera flies to it, and the site becomes interactive in place.
 */
export function Board({ onOpen, reduced, paused }: ConceptProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SVGRectElement>(null);
  const zoomRef = useRef<HTMLSpanElement>(null);
  const { width, height } = useSize(rootRef);
  const camera = useRef<Camera>({ x: WORLD.width / 2, y: WORLD.height / 2, z: 0.4 });
  const target = useRef<Camera>({ ...camera.current });
  const velocity = useRef({ x: 0, y: 0 });
  const pan = useRef<{ x: number; y: number; moved: number; id: number; t: number } | null>(null);
  /** The distance of the last drag. A click after a drag does not select a card. */
  const lastMoved = useRef(0);
  const before = useRef<Camera | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [arrived, setArrived] = useState(false);
  const started = useRef(false);

  const fit = (): Camera => frame(0, 0, WORLD.width, WORLD.height, width, height + HUD, 0.92);

  // The first view: the camera starts near the center and settles back to show the whole board.
  useEffect(() => {
    if (width === 0 || started.current) return;
    started.current = true;
    const whole = fit();
    target.current = whole;
    camera.current = reduced ? { ...whole } : { x: whole.x + 120, y: whole.y + 60, z: whole.z * 1.35 };
    // The effect runs one time, when the board has a size.
  }, [width, height, reduced]);

  const focus = (id: string): void => {
    const [x, y, w, h] = placeOf(id);
    if (!focused) before.current = { ...target.current };
    target.current = frame(x, y, w, h, width, height, 0.94);
    velocity.current = { x: 0, y: 0 };
    setArrived(false);
    setFocused(id);
  };

  const unfocus = (): void => {
    if (!focused) return;
    target.current = before.current ?? fit();
    setFocused(null);
    setArrived(false);
  };

  useLoop((dt) => {
    if (paused || width === 0) return;
    const cam = camera.current;
    const goal = target.current;
    if (!pan.current) {
      goal.x += velocity.current.x * dt;
      goal.y += velocity.current.y * dt;
      const friction = Math.exp(-4 * dt);
      velocity.current.x *= friction;
      velocity.current.y *= friction;
    }
    const k = reduced ? 1 : 1 - Math.exp(-9 * dt);
    cam.x += (goal.x - cam.x) * k;
    cam.y += (goal.y - cam.y) * k;
    cam.z *= Math.pow(goal.z / cam.z, k);
    const tx = width / 2 - cam.x * cam.z;
    const ty = height / 2 - cam.y * cam.z;
    const world = worldRef.current;
    if (world) world.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${cam.z.toFixed(5)})`;
    const root = rootRef.current;
    if (root) {
      const grid = 48 * cam.z;
      root.style.backgroundSize = `${grid}px ${grid}px, 100% 100%`;
      root.style.backgroundPosition = `${tx.toFixed(1)}px ${ty.toFixed(1)}px, 0 0`;
    }
    const view = viewRef.current;
    if (view) {
      view.setAttribute("x", String(cam.x - width / 2 / cam.z));
      view.setAttribute("y", String(cam.y - height / 2 / cam.z));
      view.setAttribute("width", String(width / cam.z));
      view.setAttribute("height", String(height / cam.z));
    }
    if (zoomRef.current) zoomRef.current.textContent = `${Math.round(cam.z * 100)}%`;
    if (focused && !arrived && Math.abs(cam.z / goal.z - 1) < 0.01 && Math.hypot(cam.x - goal.x, cam.y - goal.y) * cam.z < 2) setArrived(true);
  });

  // Esc leaves the focused site. The site has the same origin, so the board can listen to the keys in its frame too.
  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === "Escape") unfocus();
    };
    addEventListener("keydown", key);
    const frameWindow = focused && arrived ? document.querySelector<HTMLIFrameElement>(`.board [data-id="${focused}"] iframe`)?.contentWindow : null;
    try {
      frameWindow?.addEventListener("keydown", key);
    } catch {
      // A frame on a different origin keeps its keys.
    }
    return () => {
      removeEventListener("keydown", key);
      try {
        frameWindow?.removeEventListener("keydown", key);
      } catch {
        // The same as above.
      }
    };
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const wheel = (event: WheelEvent): void => {
      if (event.target instanceof Element && event.target.closest(".board-controls, .board-map")) return;
      event.preventDefault();
      const rect = root.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      const goal = target.current;
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, goal.z * Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0016))));
      const wx = goal.x + px / goal.z;
      const wy = goal.y + py / goal.z;
      target.current = { x: wx - px / z, y: wy - py / z, z };
    };
    root.addEventListener("wheel", wheel, { passive: false });
    return () => root.removeEventListener("wheel", wheel);
  }, []);

  const down = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".board-controls, .board-map, .board-hud")) return;
    pan.current = { x: event.clientX, y: event.clientY, moved: 0, id: event.pointerId, t: performance.now() };
    velocity.current = { x: 0, y: 0 };
    target.current = { ...camera.current, z: target.current.z };
  };

  const move = (event: PointerEvent<HTMLDivElement>): void => {
    const current = pan.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    current.moved += Math.abs(dx) + Math.abs(dy);
    if (current.moved > 4 && !rootRef.current?.hasPointerCapture(event.pointerId)) rootRef.current?.setPointerCapture(event.pointerId);
    const now = performance.now();
    const z = camera.current.z;
    camera.current.x -= dx / z;
    camera.current.y -= dy / z;
    target.current.x = camera.current.x;
    target.current.y = camera.current.y;
    const elapsed = Math.max(1, now - current.t) / 1000;
    velocity.current = { x: (-dx / z / elapsed) * 0.5 + velocity.current.x * 0.5, y: (-dy / z / elapsed) * 0.5 + velocity.current.y * 0.5 };
    current.x = event.clientX;
    current.y = event.clientY;
    current.t = now;
  };

  const up = (event: PointerEvent<HTMLDivElement>): void => {
    const current = pan.current;
    if (!current || current.id !== event.pointerId) return;
    pan.current = null;
    lastMoved.current = current.moved;
    if (performance.now() - current.t > 80 || reduced) velocity.current = { x: 0, y: 0 };
    if (current.moved <= 4 && focused && event.target instanceof Element && !event.target.closest(`[data-id="${focused}"]`)) unfocus();
  };

  const moved = (): boolean => Math.max(lastMoved.current, pan.current?.moved ?? 0) > 4;

  const jump = (event: MouseEvent<SVGSVGElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * WORLD.width;
    const y = ((event.clientY - rect.top) / rect.height) * WORLD.height;
    target.current = { ...target.current, x, y };
  };

  const zoomBy = (factor: number): void => {
    const goal = target.current;
    target.current = { ...goal, z: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, goal.z * factor)) };
  };

  const focusedItem = focused ? itemById(focused) : undefined;

  return (
    <div className="concept board" ref={rootRef} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
      <div className="board-world" ref={worldRef}>
        {items.map((item) => {
          const [x, y, w, h] = placeOf(item.id);
          return (
            <PlateCard
              key={item.id}
              item={item}
              width={w}
              height={h}
              interactive={focused === item.id && arrived}
              scale={1.5}
              className={focused === item.id ? "board-card is-focused" : "board-card"}
              style={{ transform: `translate(${x}px, ${y}px)` }}
              onOpen={(id) => {
                if (!moved()) focus(id);
              }}
              cardRef={(element) => {
                if (!element) return;
                element.onfocus = () => {
                  if (!pan.current && focused !== item.id) {
                    const [fx, fy, fw, fh] = placeOf(item.id);
                    target.current = frame(fx, fy, fw, fh, width, height, 0.7);
                  }
                };
              }}
            />
          );
        })}
      </div>

      {focusedItem?.kind === "site" ? (
        <div className="board-hud" style={{ "--hue": focusedItem.hue } as CSSProperties}>
          <strong>{focusedItem.name}</strong>
          <span>{arrived ? "You can use the site here." : "Flying in…"}</span>
          <button
            type="button"
            onClick={(event) => {
              const card = document.querySelector<HTMLElement>(`.board [data-id="${focusedItem.id}"]`);
              if (card) onOpen(focusedItem.id, card);
              event.currentTarget.blur();
            }}
          >
            Open full screen
          </button>
          <button type="button" className="primary" onClick={unfocus}>
            Back to the board
          </button>
        </div>
      ) : null}

      <div className="board-controls">
        <button type="button" onClick={() => zoomBy(1 / 1.4)} aria-label="Zoom out">
          −
        </button>
        <span ref={zoomRef} className="board-zoom" />
        <button type="button" onClick={() => zoomBy(1.4)} aria-label="Zoom in">
          +
        </button>
        <button
          type="button"
          onClick={() => {
            setFocused(null);
            target.current = fit();
          }}
        >
          Show all
        </button>
      </div>

      <svg className="board-map" viewBox={`0 0 ${WORLD.width} ${WORLD.height}`} onClick={jump} role="img" aria-label="A map of the board">
        {items.map((item) => {
          const [x, y, w, h] = placeOf(item.id);
          return <rect key={item.id} x={x} y={y} width={w} height={h} rx={18} fill={item.hue} opacity={item.kind === "site" ? 0.75 : 0.35} />;
        })}
        <rect ref={viewRef} className="board-map-view" rx={10} />
      </svg>
    </div>
  );
}
