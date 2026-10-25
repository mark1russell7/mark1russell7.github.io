import { CAPTION_HEIGHT, FRAME_HEIGHT, FRAME_WIDTH } from "../cards.tsx";
import type { Item, Tile } from "../content.ts";
import { type Box, columnOrder, groups, halton, plateSize, relax } from "../layout.ts";

/** A box of the layout, with the scale of its card from the base size. */
export interface Placed extends Box {
  readonly item: Item;
  readonly k: number;
}

export interface Plan {
  readonly boxes: Placed[];
  /** The height of the content. On a phone, the content is taller than the screen, and the pond scrolls. */
  readonly height: number;
  readonly phone: boolean;
}

/** A place in the pond, as a part of the width and the height. */
type Spot = readonly [number, number];

/** The place of each tile in the pond. */
const tileSpots: Readonly<Record<Tile["id"], Spot>> = {
  me: [0.12, 0.24],
  proof: [0.1, 0.66],
  now: [0.93, 0.58],
  meter: [0.95, 0.9],
};

/** The places of the first tier 2 sites, in the order of the list. The sites after them get places from `scatter`. */
const siteSpots: readonly Spot[] = [
  [0.2, 0.47],
  [0.9, 0.22],
  [0.52, 0.08],
  [0.46, 0.55],
  [0.76, 0.73],
  [0.7, 0.5],
  [0.53, 0.78],
  [0.3, 0.74],
];

/** The places of the first pebbles, near the edges. The pebbles after them go to the top edge and the bottom edge. */
const pebbleSpots: readonly Spot[] = [
  [0.25, 0.04],
  [0.78, 0.04],
  [0.06, 0.95],
  [0.3, 0.97],
  [0.98, 0.42],
];

/** This function gives an even scatter of places in the middle of the pond. The places do not repeat. */
function scatter(index: number): Spot {
  return [0.15 + 0.7 * halton(index, 2), 0.15 + 0.7 * halton(index, 3)];
}

/**
 * This function gives the start place of each item in the pond. The featured sites are in a row above the center.
 * The tier 2 sites, the tiles and the pebbles take their spots in turn.
 */
function homes(list: readonly Item[]): Map<string, Spot> {
  const { featured, sites, tiles, pebbles } = groups(list);
  const out = new Map<string, Spot>();
  featured.forEach((site, j) => out.set(site.id, [0.515 + (j - (featured.length - 1) / 2) * 0.29, 0.3 + 0.02 * (j % 2)]));
  sites.forEach((site, j) => out.set(site.id, siteSpots[j] ?? scatter(j - siteSpots.length)));
  for (const tile of tiles) out.set(tile.id, tileSpots[tile.id]);
  pebbles.forEach((pebble, j) => out.set(pebble.id, pebbleSpots[j] ?? [0.15 + 0.7 * halton(j, 2), j % 2 === 0 ? 0.96 : 0.04]));
  return out;
}

/**
 * This function makes the layout of a large screen. The cards cover half of the area, so more items make smaller cards.
 * Each card starts at its home, and `relax` then removes the overlaps.
 */
export function pondDesktop(list: readonly Item[], width: number, height: number): Plan {
  const area = list.reduce((sum, item) => {
    const size = plateSize(item);
    return sum + size.w * size.h;
  }, 0);
  const scale = Math.min(1.15, Math.max(0.5, Math.sqrt((0.5 * width * height) / area)));
  const spots = homes(list);
  const boxes: Placed[] = list.map((item) => {
    const size = plateSize(item);
    const [fx, fy] = spots.get(item.id) ?? [0.5, 0.5];
    return { id: item.id, item, k: scale, x: fx * width, y: fy * height, w: size.w * scale, h: size.h * scale };
  });
  relax(boxes, width, height, 18 * scale, 20, 400);
  return { boxes, height, phone: false };
}

/** This function makes the layout of a phone: one column of cards in the order of `columnOrder`, with the pebbles at the end. */
export function pondPhone(list: readonly Item[], width: number): Plan {
  const margin = 16;
  const gap = 18;
  const column = width - margin * 2;
  const boxes: Placed[] = [];
  let y = margin;
  for (const item of columnOrder(list)) {
    if (item.kind === "pebble") {
      boxes.push({ id: item.id, item, k: 1, x: width / 2, y: y + 29, w: column, h: 58 });
      y += 58 + 12;
      continue;
    }
    const base = plateSize(item);
    // On a phone, each site has the full width and a caption at the normal size.
    const k = item.kind === "site" ? 1 : column / base.w;
    const h = item.kind === "site" ? (column * FRAME_HEIGHT) / FRAME_WIDTH + CAPTION_HEIGHT : base.h * k;
    boxes.push({ id: item.id, item, k, x: width / 2, y: y + h / 2, w: column, h });
    y += h + gap;
  }
  return { boxes, height: y + margin + 40, phone: true };
}
