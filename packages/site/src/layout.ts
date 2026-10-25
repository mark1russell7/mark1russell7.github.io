import { CAPTION_HEIGHT, FRAME_HEIGHT, FRAME_WIDTH } from "./cards.tsx";
import type { Item, Pebble, Site, Tile } from "./content.ts";

/** The items of a list by kind. The layouts use these groups, so each new site gets a place without a change to a layout. */
export interface Groups {
  /** The tier 1 sites, in the order of the list. */
  readonly featured: readonly Site[];
  /** The tier 2 sites, in the order of the list. The written cards come first, then the found sites. */
  readonly sites: readonly Site[];
  readonly tiles: readonly Tile[];
  readonly pebbles: readonly Pebble[];
}

/** This function puts the items of a list into groups by kind and tier. Each group keeps the order of the list. */
export function groups(list: readonly Item[]): Groups {
  const featured: Site[] = [];
  const sites: Site[] = [];
  const tiles: Tile[] = [];
  const pebbles: Pebble[] = [];
  for (const item of list) {
    if (item.kind === "site") (item.tier === 1 ? featured : sites).push(item);
    else if (item.kind === "tile") tiles.push(item);
    else pebbles.push(item);
  }
  return { featured, sites, tiles, pebbles };
}

/** The tiles that come before the sites in a column. The other tiles come after the sites. */
const LEAD_TILES: ReadonlySet<Tile["id"]> = new Set(["me"]);

/** This function gives the order of the items in one column: the lead tile, the sites by tier, the other tiles, then the pebbles. */
export function columnOrder(list: readonly Item[]): Item[] {
  const { featured, sites, tiles, pebbles } = groups(list);
  return [...tiles.filter((tile) => LEAD_TILES.has(tile.id)), ...featured, ...sites, ...tiles.filter((tile) => !LEAD_TILES.has(tile.id)), ...pebbles];
}

/**
 * This function divides `count` cards into rows of `max` cards or fewer. The number of rows is as small as possible,
 * and the rows have almost the same length. The longer rows come first: 9 cards in rows of 8 or fewer give 5 and 4.
 */
export function rowSizes(count: number, max: number): number[] {
  if (count <= 0) return [];
  const rows = Math.ceil(count / Math.max(1, max));
  const base = Math.floor(count / rows);
  return Array.from({ length: rows }, (_, row) => base + (row < count % rows ? 1 : 0));
}

/** This function gives the number with the index `index` in the Halton sequence of the base `base`. The numbers spread evenly from 0 to 1. */
export function halton(index: number, base: number): number {
  let result = 0;
  let fraction = 1 / base;
  for (let n = index + 1; n > 0; n = Math.floor(n / base)) {
    result += fraction * (n % base);
    fraction /= base;
  }
  return result;
}

/** A box has its center at `x`, `y`. */
export interface Box {
  readonly id: string;
  x: number;
  y: number;
  readonly w: number;
  readonly h: number;
}

/** This function gives the base size of an item as a flat card, before the layout scales it. */
export function plateSize(item: Item): { w: number; h: number } {
  if (item.kind === "site") {
    const w = item.tier === 1 ? 420 : 300;
    return { w, h: Math.round((w * FRAME_HEIGHT) / FRAME_WIDTH + CAPTION_HEIGHT) };
  }
  if (item.kind === "pebble") {
    // The pebble is wide enough for its name (13 px, bold) and for its line of text (11 px).
    return { w: Math.round(Math.max(176, item.name.length * 8.4 + 72, item.blurb.length * 6.3 + 66)), h: 58 };
  }
  switch (item.id) {
    case "me":
      return { w: 340, h: 300 };
    case "proof":
      return { w: 300, h: 172 };
    case "now":
      return { w: 300, h: 172 };
    case "meter":
      return { w: 270, h: 168 };
  }
}

/** The pool uses its phone layouts below this width, in CSS pixels. */
export const PHONE_WIDTH = 720;

/**
 * This function moves the boxes until no two boxes overlap and each box is in the area.
 * Each step pushes two boxes apart on the axis with the smaller overlap.
 */
export function relax(boxes: Box[], width: number, height: number, gap: number, margin: number, iterations: number): void {
  for (let n = 0; n < iterations; n++) {
    let moved = false;
    for (let a = 0; a < boxes.length; a++) {
      for (let b = a + 1; b < boxes.length; b++) {
        const p = boxes[a]!;
        const q = boxes[b]!;
        const dx = q.x - p.x;
        const dy = q.y - p.y;
        const ox = (p.w + q.w) / 2 + gap - Math.abs(dx);
        const oy = (p.h + q.h) / 2 + gap - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (ox / (p.w + q.w) < oy / (p.h + q.h)) {
          const push = (ox / 2) * (dx < 0 ? -1 : 1);
          p.x -= push;
          q.x += push;
        } else {
          const push = (oy / 2) * (dy < 0 ? -1 : 1);
          p.y -= push;
          q.y += push;
        }
      }
    }
    for (const box of boxes) {
      box.x = Math.min(width - margin - box.w / 2, Math.max(margin + box.w / 2, box.x));
      box.y = Math.min(height - margin - box.h / 2, Math.max(margin + box.h / 2, box.y));
    }
    if (!moved) break;
  }
}

/** This function gives a pseudo-random number from 0 to 1 for a seed. The same seed gives the same number. */
export function random(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
