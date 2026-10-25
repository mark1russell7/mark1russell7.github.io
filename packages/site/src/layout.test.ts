import { describe, expect, test } from "vitest";
import { desktopWorld, phoneWorld } from "./board/places.ts";
import { curated, type Discovered, type Item, items, mergeSites, pebbles, tiles } from "./content.ts";
import discovered from "./discovered.json" with { type: "json" };
import { columnOrder, rowSizes } from "./layout.ts";
import { pondDesktop, pondPhone } from "./pond/homes.ts";
import { riverPlan } from "./river/lanes.ts";

/** Two sites that the build can find later. They have no written card. */
const extra: Discovered[] = [
  { repo: "first-new-site", path: "/first-new-site/", description: "A new site that the build found. It has a long description." },
  { repo: "SecondNew", path: "/SecondNew/", description: "" },
];

const longer: readonly Item[] = [...mergeSites(curated, [...discovered, ...extra]), ...tiles, ...pebbles];

const lists: readonly (readonly [string, readonly Item[]])[] = [
  ["today's items", items],
  ["two more found sites", longer],
];

/** The desktop sizes and the phone size of the stage, in CSS pixels. */
const desktops: readonly (readonly [number, number])[] = [
  [1440, 836],
  [1024, 700],
  [1920, 1016],
];
const PHONE: readonly [number, number] = [390, 780];

interface Rect {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The pairs of rectangles that overlap by more than half a pixel. */
function overlapping(rects: readonly Rect[]): string[] {
  const out: string[] = [];
  for (let a = 0; a < rects.length; a++) {
    for (let b = a + 1; b < rects.length; b++) {
      const p = rects[a]!;
      const q = rects[b]!;
      const ox = Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x);
      const oy = Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y);
      if (ox > 0.5 && oy > 0.5) out.push(`${p.id} / ${q.id}`);
    }
  }
  return out;
}

function ids(list: readonly Item[]): string[] {
  return list.map((item) => item.id).sort();
}

test("the longer list has the two found sites", () => {
  expect(longer).toHaveLength(items.length + 2);
  expect(longer.map((item) => item.id)).toEqual(expect.arrayContaining(["first-new-site", "secondnew"]));
});

describe("shared helpers", () => {
  test("rowSizes divides the cards into rows of almost the same length", () => {
    expect(rowSizes(0, 8)).toEqual([]);
    expect(rowSizes(7, 8)).toEqual([7]);
    expect(rowSizes(8, 8)).toEqual([8]);
    expect(rowSizes(9, 8)).toEqual([5, 4]);
    expect(rowSizes(17, 8)).toEqual([6, 6, 5]);
  });

  test.each(lists)("columnOrder puts the lead tile first, then the sites by tier, the other tiles and the pebbles (%s)", (_, list) => {
    const order = columnOrder(list);
    expect(ids(order)).toEqual(ids(list));
    const kinds = order.map((item) => (item.kind === "site" ? `site${item.tier}` : item.id === "me" ? "lead" : item.kind));
    const rank = ["lead", "site1", "site2", "tile", "pebble"];
    expect(kinds.map((kind) => rank.indexOf(kind))).toEqual([...kinds.map((kind) => rank.indexOf(kind))].sort((a, b) => a - b));
  });
});

describe("board", () => {
  test.each(lists)("the desktop board gives each item one place, and no two places overlap (%s)", (_, list) => {
    const world = desktopWorld(list);
    expect(Object.keys(world.places).sort()).toEqual(ids(list));
    const rects = list.map((item) => {
      const [x, y, w, h] = world.places[item.id]!;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x + w).toBeLessThanOrEqual(world.width + 0.01);
      expect(y + h).toBeLessThanOrEqual(world.height + 0.01);
      return { id: item.id, x, y, w, h };
    });
    expect(overlapping(rects)).toEqual([]);
  });

  test.each(lists)("the featured sites have the largest places of the desktop board (%s)", (_, list) => {
    const world = desktopWorld(list);
    const area = (id: string): number => {
      const place = world.places[id]!;
      return place[2] * place[3];
    };
    const sites = list.filter((item) => item.kind === "site");
    const smallestFeatured = Math.min(...sites.filter((site) => site.tier === 1).map((site) => area(site.id)));
    const largestOther = Math.max(...list.filter((item) => item.kind !== "site" || item.tier === 2).map((item) => area(item.id)));
    expect(smallestFeatured).toBeGreaterThan(largestOther);
  });

  test("the desktop board keeps the places of the featured sites and the tiles", () => {
    const world = desktopWorld(items);
    expect(world.width).toBe(2840);
    expect(world.places["systems"]).toEqual([500, 0, 880, 637]);
    expect(world.places["client"]).toEqual([1460, 0, 880, 637]);
    expect(world.places["me"]).toEqual([0, 0, 420, 370]);
    expect(world.places["meter"]).toEqual([0, 410, 420, 262]);
    expect(world.places["now"]).toEqual([2420, 0, 420, 300]);
    expect(world.places["proof"]).toEqual([2420, 340, 420, 241]);
    const row = pebbles.map((pebble) => world.places[pebble.id]!);
    expect(row.map(([x]) => x)).toEqual([0, 576, 1152, 1728, 2304]);
    expect(new Set(row.map(([, y]) => y)).size).toBe(1);
  });

  test.each(lists)("the phone board is one column with each item in it (%s)", (_, list) => {
    const world = phoneWorld(list);
    expect(Object.keys(world.places).sort()).toEqual(ids(list));
    const rects = list.map((item) => {
      const [x, y, w, h] = world.places[item.id]!;
      expect([x, w]).toEqual([0, world.width]);
      return { id: item.id, x, y, w, h };
    });
    expect(overlapping(rects)).toEqual([]);
    expect(Math.max(...rects.map((rect) => rect.y + rect.h))).toBeLessThanOrEqual(world.height);
  });
});

describe("river", () => {
  test.each(lists)("each item floats in one lane (%s)", (_, list) => {
    const plan = riverPlan(list, 1440, 836);
    expect(plan.floaters.map((f) => f.item.id).sort()).toEqual(ids(list));
    for (const f of plan.floaters) {
      if (f.item.kind === "pebble") expect(f.lane).toBe(0);
      else if (f.item.kind === "site") expect(f.lane).toBe(f.item.tier === 1 ? 2 : 1);
    }
  });

  test("the front lane keeps the order of today", () => {
    const plan = riverPlan(items, 1440, 836);
    expect(plan.floaters.filter((f) => f.lane === 2).map((f) => f.item.id)).toEqual(["me", "systems", "now", "client"]);
    expect(plan.floaters.filter((f) => f.lane === 0).map((f) => f.item.id)).toEqual(pebbles.map((pebble) => pebble.id));
  });

  for (const [width, height] of [...desktops, PHONE]) {
    test.each(lists)(`at ${width} x ${height}, no two cards of a lane overlap, also across the end of the lane (%s)`, (_, list) => {
      const plan = riverPlan(list, width, height);
      for (let lane = 0; lane < plan.lengths.length; lane++) {
        const members = plan.floaters.filter((f) => f.lane === lane).sort((a, b) => a.x - b.x);
        const length = plan.lengths[lane]!;
        members.forEach((f, k) => {
          const next = members[(k + 1) % members.length]!;
          if (next === f) return;
          const nextX = k === members.length - 1 ? next.x + length : next.x;
          expect(nextX - next.w / 2 - (f.x + f.w / 2)).toBeGreaterThanOrEqual(-0.01);
        });
      }
      // The lanes are bands on the screen, and two bands do not overlap.
      const bands = [0, 1, 2].map((lane) => {
        const members = plan.floaters.filter((f) => f.lane === lane);
        return { id: `lane ${lane}`, x: 0, w: 1, y: Math.min(...members.map((f) => f.y - f.h / 2)), h: Math.max(...members.map((f) => f.h)) };
      });
      expect(overlapping(bands)).toEqual([]);
    });
  }
});

describe("pond", () => {
  for (const [width, height] of desktops) {
    test.each(lists)(`at ${width} x ${height}, the desktop pond gives each item a box in the area, and no two boxes overlap (%s)`, (_, list) => {
      const plan = pondDesktop(list, width, height);
      expect(plan.boxes.map((box) => box.id).sort()).toEqual(ids(list));
      const rects = plan.boxes.map((box) => ({ id: box.id, x: box.x - box.w / 2, y: box.y - box.h / 2, w: box.w, h: box.h }));
      for (const rect of rects) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.x + rect.w).toBeLessThanOrEqual(width + 0.01);
        expect(rect.y + rect.h).toBeLessThanOrEqual(height + 0.01);
      }
      expect(overlapping(rects)).toEqual([]);
    });
  }

  test.each(lists)("the phone pond is one column with each item in it (%s)", (_, list) => {
    const [width] = PHONE;
    const plan = pondPhone(list, width);
    expect(plan.boxes.map((box) => box.id).sort()).toEqual(ids(list));
    const rects = plan.boxes.map((box) => ({ id: box.id, x: box.x - box.w / 2, y: box.y - box.h / 2, w: box.w, h: box.h }));
    expect(overlapping(rects)).toEqual([]);
    expect(Math.max(...rects.map((rect) => rect.y + rect.h))).toBeLessThanOrEqual(plan.height);
    expect(columnOrder(list).map((item) => item.id)).toEqual(plan.boxes.map((box) => box.id));
  });
});
