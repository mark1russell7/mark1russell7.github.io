import { type CSSProperties, type MouseEvent, type PointerEvent, type ReactElement, useEffect, useMemo, useRef, useState } from "react";
import { PlateCard } from "../cards.tsx";
import type { ConceptProps } from "../concept.ts";
import { itemById, items } from "../content.ts";
import { PHONE_WIDTH } from "../layout.ts";
import { useLoop, useSize } from "../loop.ts";

/** The place and the size of an item on the board, in world units: x, y, width and height. */
type Place = readonly [number, number, number, number];

interface World {
  readonly places: Readonly<Record<string, Place>>;
  readonly width: number;
  readonly height: number;
  readonly phone: boolean;
}

/** The board on a large screen: the featured sites in the middle of the first row, and the other sites in the second row. */
const desktop: World = {
  places: {
    me: [0, 0, 420, 370],
    vex: [500, 0, 880, 637],
    "async-browser-context": [1460, 0, 880, 637],
    now: [2420, 0, 420, 300],
    meter: [0, 410, 420, 262],
    proof: [2420, 340, 420, 241],
    lag: [0, 760, 520, 412],
    client: [580, 760, 520, 412],
    render: [1160, 760, 520, 412],
    systems: [1740, 760, 520, 412],
    "page-lifecycle-tracker": [2320, 760, 520, 412],
    "ste-lint": [0, 1252, 536, 96],
    optional: [576, 1252, 536, 96],
    cue: [1152, 1252, 536, 96],
    "otel-ts": [1728, 1252, 536, 96],
    template: [2304, 1252, 536, 96],
  },
  width: 2840,
  height: 1348,
  phone: false,
};

/** This function makes the board of a phone: one column of cards, and the pebbles in two columns at the end. */
function phoneWorld(): World {
  const width = 600;
  const gap = 40;
  const heights: Record<string, number> = { me: 529, proof: 344, now: 344, meter: 374 };
  const order = ["me", "vex", "async-browser-context", "lag", "client", "render", "systems", "page-lifecycle-tracker", "proof", "now", "meter"];
  const places: Record<string, Place> = {};
  let y = 0;
  for (const id of order) {
    const h = heights[id] ?? 462;
    places[id] = [0, y, width, h];
    y += h + gap;
  }
  items
    .filter((item) => item.kind === "pebble")
    .forEach((item, index) => {
      if (index % 2 === 0 && index > 0) y += 96 + 20;
      places[item.id] = [(index % 2) * 310, y, 290, 96];
    });
  return { places, width, height: y + 96, phone: true };
}

const phone: World = phoneWorld();

const MIN_ZOOM = 0.12;
const MAX_ZOOM = 3;
const HUD = 64;

interface Camera {
  x: number;
  y: number;
  z: number;
}

function placeOf(world: World, id: string): Place {
  return world.places[id] ?? [0, 0, 100, 100];
}

/** This function gives the camera that shows the rectangle in the viewport, with a margin. */
function frame(x: number, y: number, w: number, h: number, width: number, height: number, fill: number): Camera {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((width * fill) / w, ((height - HUD) * fill) / h)));
  return { x: x + w / 2, y: y + h / 2 - HUD / 2 / z, z };
}

/**
 * The board: an infinite canvas with each item at a fixed place. Drag to move the board, and scroll or pinch to zoom.
 * When the user selects a site, the camera flies to it, and the site becomes interactive in place.
 * On a phone, the board is one column, and a site opens in a full-screen panel.
 */
export function Board({ onOpen, reduced, paused }: ConceptProps): ReactElement {
  const rootRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<SVGRectElement>(null);
  const zoomRef = useRef<HTMLSpanElement>(null);
  const { width, height } = useSize(rootRef);
  const world = useMemo(() => (width > 0 && width < PHONE_WIDTH ? phone : desktop), [width]);
  const camera = useRef<Camera>({ x: desktop.width / 2, y: desktop.height / 2, z: 0.4 });
  const target = useRef<Camera>({ ...camera.current });
  const velocity = useRef({ x: 0, y: 0 });
  const pan = useRef<{ x: number; y: number; moved: number; id: number; t: number } | null>(null);
  /** The pointers on the board. Two pointers make a pinch. */
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ distance: number; x: number; y: number } | null>(null);
  /** The distance of the last drag. A click after a drag does not select a card. */
  const lastMoved = useRef(0);
  const before = useRef<Camera | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const [arrived, setArrived] = useState(false);
  const shown = useRef<World | null>(null);

  /** This function gives the camera for the whole board. On a phone, the camera shows the full width at the top of the column. */
  const home = (): Camera => {
    if (world.phone) {
      const z = (width * 0.92) / world.width;
      return { x: world.width / 2, y: (height / 2 - 16) / z, z };
    }
    // The controls and the map cover the bottom right corner, so the whole board fits in the space above them.
    const whole = frame(0, 0, world.width, world.height, width, height + HUD - 150, 0.92);
    return { ...whole, y: whole.y + 75 / whole.z };
  };

  // The first view: the camera starts near the center and settles back to show the board.
  useEffect(() => {
    if (width === 0 || shown.current === world) return;
    shown.current = world;
    const whole = home();
    target.current = whole;
    camera.current = reduced ? { ...whole } : { x: whole.x + 120, y: whole.y + 60, z: whole.z * 1.35 };
    // The effect runs when the board gets a size, and when the layout changes between the phone and the desktop.
  }, [width, height, reduced, world]);

  const focus = (id: string): void => {
    const [x, y, w, h] = placeOf(world, id);
    if (!focused) before.current = { ...target.current };
    target.current = frame(x, y, w, h, width, height, 0.94);
    velocity.current = { x: 0, y: 0 };
    setArrived(false);
    setFocused(id);
  };

  const unfocus = (): void => {
    if (!focused) return;
    target.current = before.current ?? home();
    setFocused(null);
    setArrived(false);
  };

  useLoop((dt) => {
    if (paused || width === 0) return;
    const cam = camera.current;
    const goal = target.current;
    if (!pan.current && !pinch.current) {
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
    const plane = worldRef.current;
    if (plane) plane.style.transform = `translate(${tx.toFixed(2)}px, ${ty.toFixed(2)}px) scale(${cam.z.toFixed(5)})`;
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

  /** This function zooms the target camera by `factor`, and keeps the world point under the screen point `px`, `py` in place. */
  const zoomAt = (px: number, py: number, factor: number): void => {
    const goal = target.current;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, goal.z * factor));
    const wx = goal.x + px / goal.z;
    const wy = goal.y + py / goal.z;
    target.current = { x: wx - px / z, y: wy - py / z, z };
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const wheel = (event: WheelEvent): void => {
      if (event.target instanceof Element && event.target.closest(".board-controls, .board-map")) return;
      event.preventDefault();
      const rect = root.getBoundingClientRect();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      zoomAt(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height / 2, Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0016)));
    };
    root.addEventListener("wheel", wheel, { passive: false });
    return () => root.removeEventListener("wheel", wheel);
  }, []);

  const pinchState = (): { distance: number; x: number; y: number } | null => {
    const [a, b] = [...touches.current.values()];
    if (!a || !b) return null;
    return { distance: Math.hypot(a.x - b.x, a.y - b.y), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  };

  const down = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest(".board-controls, .board-map, .board-hud")) return;
    touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    velocity.current = { x: 0, y: 0 };
    target.current = { ...camera.current, z: target.current.z };
    if (touches.current.size === 2) {
      pan.current = null;
      lastMoved.current = 99;
      pinch.current = pinchState();
      return;
    }
    pan.current = { x: event.clientX, y: event.clientY, moved: 0, id: event.pointerId, t: performance.now() };
  };

  const move = (event: PointerEvent<HTMLDivElement>): void => {
    if (touches.current.has(event.pointerId)) touches.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const previous = pinch.current;
    if (previous) {
      const next = pinchState();
      const rect = rootRef.current?.getBoundingClientRect();
      if (!next || !rect || previous.distance === 0) return;
      const z = camera.current.z;
      camera.current.x -= (next.x - previous.x) / z;
      camera.current.y -= (next.y - previous.y) / z;
      target.current = { ...camera.current, z: target.current.z };
      zoomAt(next.x - rect.left - rect.width / 2, next.y - rect.top - rect.height / 2, next.distance / previous.distance);
      camera.current = { ...target.current };
      pinch.current = next;
      return;
    }
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
    touches.current.delete(event.pointerId);
    if (pinch.current) {
      if (touches.current.size < 2) pinch.current = null;
      return;
    }
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
    const x = ((event.clientX - rect.left) / rect.width) * world.width;
    const y = ((event.clientY - rect.top) / rect.height) * world.height;
    target.current = { ...target.current, x, y };
  };

  const focusedItem = focused ? itemById(focused) : undefined;

  return (
    <div
      className={world.phone ? "concept board is-phone" : "concept board"}
      ref={rootRef}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="board-world" ref={worldRef}>
        {items.map((item) => {
          const [x, y, w, h] = placeOf(world, item.id);
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
              onOpen={(id, element) => {
                if (moved()) return;
                // A site at the width of a phone is too small to use in place, so the phone opens it in the panel.
                if (world.phone) onOpen(id, element);
                else focus(id);
              }}
              cardRef={(element) => {
                if (!element) return;
                element.onfocus = () => {
                  if (!pan.current && focused !== item.id) {
                    const [fx, fy, fw, fh] = placeOf(world, item.id);
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
        <button type="button" onClick={() => zoomAt(0, 0, 1 / 1.4)} aria-label="Zoom out">
          −
        </button>
        <span ref={zoomRef} className="board-zoom" />
        <button type="button" onClick={() => zoomAt(0, 0, 1.4)} aria-label="Zoom in">
          +
        </button>
        <button
          type="button"
          onClick={() => {
            setFocused(null);
            target.current = home();
          }}
        >
          {world.phone ? "Top" : "Show all"}
        </button>
      </div>

      {world.phone ? null : (
        <svg className="board-map" viewBox={`0 0 ${world.width} ${world.height}`} onClick={jump} role="img" aria-label="A map of the board">
          {items.map((item) => {
            const [x, y, w, h] = placeOf(world, item.id);
            return <rect key={item.id} x={x} y={y} width={w} height={h} rx={18} fill={item.hue} opacity={item.kind === "site" ? 0.75 : 0.35} />;
          })}
          <rect ref={viewRef} className="board-map-view" rx={10} />
        </svg>
      )}
    </div>
  );
}
