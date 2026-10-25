import { CAPTION_HEIGHT, FRAME_HEIGHT, FRAME_WIDTH } from "../cards.tsx";
import type { Item, Tile } from "../content.ts";
import { columnOrder, groups, rowSizes } from "../layout.ts";

/** The place and the size of an item on the board, in world units: x, y, width and height. */
export type Place = readonly [number, number, number, number];

export interface World {
  readonly places: Readonly<Record<string, Place>>;
  readonly width: number;
  readonly height: number;
  readonly phone: boolean;
}

/** The space between the columns of the first row of the board. */
const GUTTER = 80;
/** The space between two cards of a row, and between two rows. */
const GAP = 40;
/** The space above the rows of tier 2 sites, and the space above the rows of pebbles. */
const SITES_TOP = 88;
const PEBBLES_TOP = 80;
/** The width of a column of tiles. */
const COLUMN = 420;
/** The size of a featured site. */
const FEATURED_WIDTH = 880;
const FEATURED_HEIGHT = 637;
/** The board shows the caption of a site at 1.5 times its base size. */
const CAPTION = CAPTION_HEIGHT * 1.5;
/** The tier 2 sites make rows of this number of sites or fewer. The width of the board sets the width of each site. */
const SITES_IN_ROW = 8;
const SITE_MIN = 320;
const SITE_MAX = 440;
const PEBBLES_IN_ROW = 5;
const PEBBLE_MAX = 536;
const PEBBLE_HEIGHT = 96;

/** The column, the position in the column and the height of each tile on the desktop board. */
const tileSlots: Readonly<Record<Tile["id"], { readonly column: "left" | "right"; readonly rank: number; readonly height: number }>> = {
  me: { column: "left", rank: 0, height: 370 },
  meter: { column: "left", rank: 1, height: 262 },
  now: { column: "right", rank: 0, height: 300 },
  proof: { column: "right", rank: 1, height: 241 },
};

/** The height of each tile on the phone board. */
const phoneTileHeights: Readonly<Record<Tile["id"], number>> = { me: 529, proof: 344, now: 344, meter: 374 };

/**
 * This function puts rows of cards with the same size in the band from `top`, and gives the bottom of the band.
 * The cards of a full row fill the width, but each card is `max` wide or less. A short row is in the center.
 */
function fillRows(
  places: Record<string, Place>,
  list: readonly Item[],
  sizes: readonly number[],
  width: number,
  top: number,
  max: number,
  height: (w: number) => number,
): number {
  const columns = sizes[0] ?? 0;
  if (columns === 0) return top;
  const w = Math.min(max, (width - (columns - 1) * GAP) / columns);
  const h = height(w);
  let y = top;
  let next = 0;
  for (const count of sizes) {
    const x0 = (width - (count * w + (count - 1) * GAP)) / 2;
    for (let k = 0; k < count; k++) {
      const item = list[next++]!;
      places[item.id] = [x0 + k * (w + GAP), y, w, h];
    }
    y += h + GAP;
  }
  return y - GAP;
}

/**
 * This function makes the board of a large screen from the items of `list`.
 * The first row has the featured sites in the middle, with a column of tiles on each side.
 * The tier 2 sites fill the rows below, and the pebbles fill the last rows. The number of sites sets the number of rows.
 */
export function desktopWorld(list: readonly Item[]): World {
  const { featured, sites, tiles, pebbles } = groups(list);
  const places: Record<string, Place> = {};

  // The first row: the left tiles, the featured sites and the right tiles.
  const side = (column: "left" | "right"): Tile[] =>
    tiles.filter((tile) => tileSlots[tile.id].column === column).sort((a, b) => tileSlots[a.id].rank - tileSlots[b.id].rank);
  const left = side("left");
  const right = side("right");
  const parts = [left.length > 0 ? COLUMN : 0, ...featured.map(() => FEATURED_WIDTH), right.length > 0 ? COLUMN : 0].filter((w) => w > 0);
  const topWidth = parts.reduce((sum, w) => sum + w, 0) + GUTTER * Math.max(0, parts.length - 1);

  // The board is wide enough for a full row of sites at the smallest width.
  const siteRows = rowSizes(sites.length, SITES_IN_ROW);
  const siteColumns = siteRows[0] ?? 0;
  const width = Math.max(topWidth, siteColumns * SITE_MIN + Math.max(0, siteColumns - 1) * GAP);

  let x = (width - topWidth) / 2;
  let topHeight = 0;
  const column = (members: readonly Tile[]): void => {
    if (members.length === 0) return;
    let y = 0;
    for (const tile of members) {
      const h = tileSlots[tile.id].height;
      places[tile.id] = [x, y, COLUMN, h];
      y += h + GAP;
    }
    topHeight = Math.max(topHeight, y - GAP);
    x += COLUMN + GUTTER;
  };
  column(left);
  for (const site of featured) {
    places[site.id] = [x, 0, FEATURED_WIDTH, FEATURED_HEIGHT];
    topHeight = Math.max(topHeight, FEATURED_HEIGHT);
    x += FEATURED_WIDTH + GUTTER;
  }
  column(right);

  let bottom = topHeight;
  if (sites.length > 0) {
    bottom = fillRows(places, sites, siteRows, width, bottom + (bottom > 0 ? SITES_TOP : 0), SITE_MAX, (w) => Math.round((w * FRAME_HEIGHT) / FRAME_WIDTH + CAPTION));
  }
  if (pebbles.length > 0) {
    bottom = fillRows(places, pebbles, rowSizes(pebbles.length, PEBBLES_IN_ROW), width, bottom + (bottom > 0 ? PEBBLES_TOP : 0), PEBBLE_MAX, () => PEBBLE_HEIGHT);
  }
  return { places, width, height: bottom, phone: false };
}

/** This function makes the board of a phone: one column of cards in the order of `columnOrder`, with the pebbles at the end. */
export function phoneWorld(list: readonly Item[]): World {
  const width = 600;
  const places: Record<string, Place> = {};
  let y = 0;
  for (const item of columnOrder(list)) {
    if (item.kind === "pebble") {
      places[item.id] = [0, y, width, PEBBLE_HEIGHT];
      y += PEBBLE_HEIGHT + 20;
      continue;
    }
    const h = item.kind === "tile" ? phoneTileHeights[item.id] : 462;
    places[item.id] = [0, y, width, h];
    y += h + GAP;
  }
  return { places, width, height: y, phone: true };
}
