import { describe, expect, test } from "vitest";
import discovered from "./discovered.json" with { type: "json" };
import { autoSite, curated, firstView, items, mergeSites, picked, pickedItems, sites, tiles } from "./content.ts";

describe("sites", () => {
  test("each found site has a card, and the written cards come first", () => {
    const paths = new Set(sites.map((site) => site.path.toLowerCase()));
    for (const found of discovered) expect(paths.has(found.path.toLowerCase())).toBe(true);
    expect(sites.slice(0, curated.length)).toEqual(curated);
  });

  test("each item has its own identifier", () => {
    const ids = items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("a found site with a written card gets no second card", () => {
    const merged = mergeSites(curated, [{ repo: "Vex", path: "/VEX/", description: "x" }]);
    expect(merged).toHaveLength(curated.length);
  });

  test("an automatic card takes its text from the description", () => {
    const card = autoSite({ repo: "newthing", path: "/newthing/", description: "A short line. More text here." }, 0);
    expect(card).toMatchObject({ id: "newthing", name: "newthing", path: "/newthing/", tagline: "A short line", tier: 2 });
    expect(card.blurb).toBe("A short line. More text here.");
    expect(autoSite({ repo: "x", path: "/x/", description: "" }, 1).blurb).toBe("The site of x.");
    expect(autoSite({ repo: "y", path: "/y/", description: "w".repeat(60) }, 2).tagline).toHaveLength(48);
  });
});

describe("the first view", () => {
  test("each picked identifier is a site with a written card", () => {
    for (const id of picked) expect(curated.some((site) => site.id === id), id).toBe(true);
  });

  test("the first view has the picked sites in their order, then the tiles", () => {
    expect(firstView.map((item) => item.id)).toEqual([...picked, ...tiles.map((tile) => tile.id)]);
  });

  test("an identifier without a site gives no card", () => {
    expect(pickedItems(["systems", "no-such-site"]).filter((item) => item.kind === "site").map((item) => item.id)).toEqual(["systems"]);
  });

  test("all the items include each item of the first view", () => {
    const ids = new Set(items.map((item) => item.id));
    for (const item of firstView) expect(ids.has(item.id), item.id).toBe(true);
    expect(sites.length).toBeGreaterThan(picked.length);
  });
});
