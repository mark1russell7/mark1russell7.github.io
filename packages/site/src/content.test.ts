import { describe, expect, test } from "vitest";
import discovered from "./discovered.json" with { type: "json" };
import { autoSite, curated, mergeSites, sites } from "./content.ts";

describe("sites", () => {
  test("each found site has a card, and the written cards come first", () => {
    const paths = new Set(sites.map((site) => site.path.toLowerCase()));
    for (const found of discovered) expect(paths.has(found.path.toLowerCase())).toBe(true);
    expect(sites.slice(0, curated.length)).toEqual(curated);
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
