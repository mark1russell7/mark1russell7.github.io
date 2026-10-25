import type { Item, Site, Tile } from "../content.ts";
import { groups, plateSize, random } from "../layout.ts";

/** A lane of the river. Each lane is a depth. A far lane is higher on the screen, smaller and slower. */
export interface Lane {
  readonly items: readonly Item[];
  readonly depth: number;
  /** The center line of the lane, as a part of the height. */
  readonly y: number;
  readonly speed: number;
}

/** The lane and the position of each tile in its lane, as a part of the lane. The tiles go between the sites. */
const tileSlots: Readonly<Record<Tile["id"], { readonly lane: "middle" | "front"; readonly at: number }>> = {
  me: { lane: "front", at: 0 },
  now: { lane: "front", at: 0.5 },
  proof: { lane: "middle", at: 0.15 },
  meter: { lane: "middle", at: 0.8 },
};

/** This function puts each tile between the sites, at the part of the lane that `tileSlots` gives. */
function weave(sites: readonly Site[], tiles: readonly Tile[]): Item[] {
  const out: Item[] = [...sites];
  // The tile with the largest position goes in first, so the positions of the other tiles stay correct.
  const ordered = [...tiles].sort((a, b) => tileSlots[b.id].at - tileSlots[a.id].at);
  for (const tile of ordered) out.splice(Math.round(tileSlots[tile.id].at * sites.length), 0, tile);
  return out;
}

/**
 * This function gives the three lanes of the river from the items of `list`. The far lane has the pebbles.
 * The middle lane has the tier 2 sites, and the front lane has the featured sites. The number of items in a lane sets its length.
 */
export function riverLanes(list: readonly Item[]): Lane[] {
  const { featured, sites, tiles, pebbles } = groups(list);
  const of = (lane: "middle" | "front"): Tile[] => tiles.filter((tile) => tileSlots[tile.id].lane === lane);
  return [
    { items: pebbles, depth: 0.74, y: 0.13, speed: 0.5 },
    { items: weave(sites, of("middle")), depth: 0.8, y: 0.4, speed: 0.72 },
    { items: weave(featured, of("front")), depth: 1, y: 0.73, speed: 1 },
  ];
}

export interface Floater {
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

export interface Plan {
  readonly lanes: readonly Lane[];
  readonly floaters: Floater[];
  /** The length of each lane. A card that goes out at the left end comes in again at this distance to the right. */
  readonly lengths: number[];
  readonly scale: number;
}

/** This function gives the cards of the river at their start positions for a stage of `width` and `height`. */
export function riverPlan(list: readonly Item[], width: number, height: number): Plan {
  const lanes = riverLanes(list);
  // The largest card of the front lane fills 38% of the height, but not more than 82% of the width, so it fits on a phone.
  const scale = Math.min(1.25, Math.max(0.45, Math.min((height * 0.38) / 320, (width * 0.82) / 420)));
  const floaters: Floater[] = [];
  const lengths: number[] = [];
  lanes.forEach((lane, index) => {
    const members = lane.items;
    if (members.length === 0) {
      lengths.push(width);
      return;
    }
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
  return { lanes, floaters, lengths, scale };
}
