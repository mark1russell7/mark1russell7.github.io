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

/** The part of the area of the pond that the cards cover. */
export const POND_FILL = 0.5;

/** The smallest scale of a card. At this scale, the caption of a site has text of 8.4 px or more. More sites make the pond taller, not the cards smaller. */
export const MIN_SCALE = 0.7;

/** The largest scale of a card. */
const MAX_SCALE = 1.15;

/** The space between the cards and the edge of the pond, in pixels. */
const MARGIN = 20;

/** The number of passes of `relax` in one layout. */
const PASSES = 400;

/** The largest number of tries of a tall pond. Each try covers less of the area below the first screen. */
const TRIES = 30;

/** This function gives the area of the base sizes of a list of items. */
function baseArea(list: readonly Item[]): number {
  return list.reduce((sum, item) => {
    const size = plateSize(item);
    return sum + size.w * size.h;
  }, 0);
}

/** The number of points of the scatter that each site tries as its start. */
const CANDIDATES = 128;

/** This function gives the area of the overlaps of a box at `x`, `y` with the boxes of `others`. Each box has the space `gap` around it. */
function overlapArea(x: number, y: number, box: Placed, others: readonly Placed[], gap: number): number {
  let sum = 0;
  for (const other of others) {
    const ox = (box.w + other.w) / 2 + gap - Math.abs(other.x - x);
    const oy = (box.h + other.h) / 2 + gap - Math.abs(other.y - y);
    if (ox > 0 && oy > 0) sum += ox * oy;
  }
  return sum;
}

/** One try of the desktop layout. */
interface Try {
  readonly boxes: Placed[];
  /** The height of the pond. */
  readonly full: number;
  /** The value is true when `relax` removed each overlap. */
  readonly settled: boolean;
}

/**
 * This function settles the cards of the first screen with `relax`. These cards are the featured sites, the tiles and the first `lead` sites with a spot.
 * The pebbles of the top edge are also in the first screen. With `bottomPebbles`, the pebbles of the bottom edge are there too.
 * The function gives the boxes of the first screen, or `undefined` when `relax` does not settle them.
 */
function firstScreen(boxes: ReadonlyMap<string, Placed>, list: readonly Item[], width: number, height: number, gap: number, lead: number, bottomPebbles: boolean): Placed[] | undefined {
  const { featured, sites, tiles, pebbles } = groups(list);
  const first: Placed[] = [];
  const put = (id: string, x: number, y: number): void => {
    const box = boxes.get(id)!;
    box.x = x;
    box.y = y;
    first.push(box);
  };
  // The featured sites are in a row above the center, with space for their width between them.
  const step = Math.max(0.29 * width, ...featured.map((site) => boxes.get(site.id)!.w + 2 * gap));
  featured.forEach((site, j) => put(site.id, 0.515 * width + (j - (featured.length - 1) / 2) * step, (0.3 + 0.02 * (j % 2)) * height));
  for (const tile of tiles) put(tile.id, tileSpots[tile.id][0] * width, tileSpots[tile.id][1] * height);
  sites.slice(0, lead).forEach((site, j) => put(site.id, siteSpots[j]![0] * width, siteSpots[j]![1] * height));
  pebbles.forEach((pebble, j) => {
    const [fx, fy] = pebbleSpots[j] ?? [0.15 + 0.7 * halton(j, 2), j % 2 === 0 ? 0.96 : 0.04];
    if (fy < 0.5 || bottomPebbles) put(pebble.id, fx * width, fy * height);
  });
  return relax(first, width, height, gap, MARGIN, PASSES) ? first : undefined;
}

/**
 * This function makes one try of the desktop layout at the scale `k`. With `oneScreen`, each card is in the first screen.
 * Without it, the other sites cover the part `fill` of the space that is left in the first screen and of the space below it.
 *
 * - The first screen holds the featured sites, the tiles and the sites with a spot, while their area fits and `relax` settles them.
 * - The other sites start in an even scatter, first in the space that is left in the first screen, then below it.
 *   Each site takes the point of the scatter with the least overlap. `relax` then removes the overlaps, and the cards of the first screen stay.
 * - The pebbles of the bottom edge make a row below the lowest site.
 */
function attempt(list: readonly Item[], width: number, height: number, k: number, oneScreen: boolean, fill: number): Try {
  const { featured, sites, tiles, pebbles } = groups(list);
  const gap = 18 * k;
  const boxes = new Map<string, Placed>(
    list.map((item) => {
      const size = plateSize(item);
      return [item.id, { id: item.id, item, k, x: width / 2, y: height / 2, w: size.w * k, h: size.h * k }];
    }),
  );
  // The sites with a spot go to the first screen while their area fits.
  const screen = (POND_FILL * width * height) / (k * k);
  let used = baseArea([...tiles, ...featured, ...pebbles]);
  let lead = 0;
  for (const site of sites.slice(0, siteSpots.length)) {
    used += baseArea([site]);
    if (!oneScreen && used > screen) break;
    lead++;
  }
  let first = firstScreen(boxes, list, width, height, gap, lead, oneScreen);
  while (!first && lead > 0) first = firstScreen(boxes, list, width, height, gap, --lead, oneScreen);
  // On a very small screen, the first cards need more height than the screen.
  for (let tall = height * 1.1; !first; tall *= 1.1) first = firstScreen(boxes, list, width, tall, gap, 0, oneScreen);

  // The other sites fill the space that is left in the first screen, then the space below it.
  // Each site tries a few points of an even scatter, and takes the point with the least overlap.
  const rest = sites.slice(lead).map((site) => boxes.get(site.id)!);
  const fixed = new Set(first.map((box) => box.id));
  const seated: Placed[] = [...first];
  let draw = 0;
  const seat = (box: Placed, top: number, bottom: number): number => {
    let best = Infinity;
    for (let c = 0; c < CANDIDATES && best > 0; c++, draw++) {
      const x = Math.min(width - MARGIN - box.w / 2, Math.max(MARGIN + box.w / 2, width * halton(draw, 2)));
      const y = Math.min(bottom - MARGIN - box.h / 2, Math.max(top + MARGIN + box.h / 2, top + (bottom - top) * halton(draw, 3)));
      const cost = overlapArea(x, y, box, seated, gap);
      if (cost < best) {
        best = cost;
        box.x = x;
        box.y = y;
      }
    }
    return best;
  };
  // A site stays in the first screen when the area of the cards fits and the site finds a free place. In one screen, each site stays.
  let room = fill * width * height - first.reduce((sum, box) => sum + box.w * box.h, 0);
  const lower: Placed[] = [];
  for (const box of rest) {
    if (!oneScreen && (lower.length > 0 || box.w * box.h > room || seat(box, 0, height) > 0)) {
      lower.push(box);
      continue;
    }
    if (oneScreen) seat(box, 0, height);
    else fixed.add(box.id);
    room -= box.w * box.h;
    seated.push(box);
  }
  const band = lower.reduce((sum, box) => sum + box.w * box.h, 0) / (fill * width);
  const full = height + band;
  for (const box of lower) {
    seat(box, height - MARGIN, full + MARGIN);
    seated.push(box);
  }
  const moving = [...first, ...rest];
  const settled = relax(moving, width, oneScreen ? height : full, gap, MARGIN, PASSES, fixed);

  // The pebbles of the bottom edge make a row below the lowest site.
  let bottom = Math.max(...moving.map((box) => box.y + box.h / 2));
  const row = pebbles.filter((pebble) => !fixed.has(pebble.id)).map((pebble) => {
    const box = boxes.get(pebble.id)!;
    const j = pebbles.indexOf(pebble);
    box.x = (pebbleSpots[j]?.[0] ?? 0.15 + 0.7 * halton(j, 2)) * width;
    box.y = bottom + gap + box.h / 2;
    return box;
  });
  if (row.length > 0) {
    relax(row, width, Infinity, gap, MARGIN, PASSES);
    bottom = Math.max(...row.map((box) => box.y + box.h / 2));
  }
  return { boxes: [...boxes.values()], full: Math.max(height, bottom + MARGIN), settled };
}

/**
 * This function makes the layout of a large screen. The cards cover `POND_FILL` of the area, at a scale from `MIN_SCALE` to 1.15.
 * When the cards do not fit in one screen at `MIN_SCALE`, the pond is taller than the screen and scrolls.
 * The first screen holds the featured sites, the tiles and the sites with a spot. The other sites go around them and below them.
 * When `relax` does not settle a tall pond, the next try covers less of the area, so the pond is taller.
 */
export function pondDesktop(list: readonly Item[], width: number, height: number): Plan {
  const fit = Math.sqrt((POND_FILL * width * height) / baseArea(list));
  let k = Math.min(MAX_SCALE, Math.max(MIN_SCALE, fit));
  // When the area of the cards fits, the first tries put each card in one screen. When the cards do not settle, the next try has smaller cards.
  for (; fit >= MIN_SCALE; k = Math.max(MIN_SCALE, k * 0.95)) {
    const layout = attempt(list, width, height, k, true, POND_FILL);
    if (layout.settled && layout.full <= height) return { boxes: layout.boxes, height, phone: false };
    if (k <= MIN_SCALE) break;
  }
  let layout = attempt(list, width, height, k, false, POND_FILL);
  for (let n = 1, fill = POND_FILL * 0.92; n < TRIES && !layout.settled; n++, fill *= 0.92) layout = attempt(list, width, height, k, false, fill);
  return { boxes: layout.boxes, height: layout.full, phone: false };
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
