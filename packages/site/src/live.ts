import { type FocusEvent, type PointerEvent, useEffect, useRef, useSyncExternalStore } from "react";

/**
 * This number sets how many cards can show a live site at one time. `Number.POSITIVE_INFINITY` gives each card its frame again.
 * A live frame costs a whole document in the main thread of the pool, so the cards show posters.
 */
export const LIVE_FRAME_LIMIT: number = 1;

/** A pointer stays on a card for this time before the site starts. A pointer that crosses the pool starts nothing. */
const LIVE_DELAY_MS = 300;

/** This class records the cards that show a live site. The newest card stays, and the oldest card goes back to its poster. */
export class LiveFrames {
  private ids: readonly string[] = [];
  private held: string | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** This method gives true when the card can show its site. */
  isLive(id: string): boolean {
    return this.limit === Number.POSITIVE_INFINITY || this.ids.includes(id);
  }

  /** This method gives the card a live frame. The frames over the limit go. A held frame stays, and the card gets nothing. */
  claim(id: string): void {
    if (this.ids.includes(id) || this.held !== null) return;
    const ids = [...this.ids, id];
    this.set(ids.slice(Math.max(0, ids.length - this.limit)));
  }

  /** This method unloads the frame of the card. A held frame stays. */
  release(id: string): void {
    if (id !== this.held && this.ids.includes(id)) this.set(this.ids.filter((other) => other !== id));
  }

  /** This method keeps a frame for a site that the user works in. A pointer on another card cannot take the frame. */
  hold(id: string): void {
    this.held = null;
    this.claim(id);
    this.held = id;
  }

  /** This method ends a hold and unloads the frame. */
  letGo(id: string): void {
    if (this.held !== id) return;
    this.held = null;
    this.release(id);
  }

  private set(ids: readonly string[]): void {
    this.ids = ids;
    for (const listener of this.listeners) listener();
  }
}

const liveFrames = new LiveFrames(LIVE_FRAME_LIMIT);

/** This hook gives true when the card of the site can show the site. */
export function useLive(id: string): boolean {
  return useSyncExternalStore(liveFrames.subscribe, () => liveFrames.isLive(id));
}

/** This hook keeps a frame while `id` is a string. The open site holds it, so the limit counts the panel too. */
export function useHeldFrame(id: string | null): void {
  useEffect(() => {
    if (id === null) return undefined;
    liveFrames.hold(id);
    return () => {
      liveFrames.letGo(id);
    };
  }, [id]);
}

/** The handlers that a card puts on its element. */
export interface LiveCard {
  readonly onPointerEnter: (event: PointerEvent) => void;
  readonly onPointerLeave: () => void;
  readonly onFocus: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur: () => void;
}

/**
 * This hook starts the site of a card when a mouse rests on the card, or when the keyboard moves to it.
 * A touch starts nothing, because a touch opens the site in its panel. Leaving the card unloads the site.
 */
export function useLiveCard(id: string): LiveCard {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const stop = (): void => {
    clearTimeout(timer.current);
    liveFrames.release(id);
  };
  const start = (): void => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      liveFrames.claim(id);
    }, LIVE_DELAY_MS);
  };
  // A card that leaves the page keeps no frame and no timer.
  useEffect(() => stop, [id]);
  return {
    onPointerEnter: (event) => {
      if (event.pointerType === "mouse") start();
    },
    onPointerLeave: stop,
    onFocus: (event) => {
      if (event.currentTarget.matches(":focus-visible")) start();
    },
    onBlur: stop,
  };
}
