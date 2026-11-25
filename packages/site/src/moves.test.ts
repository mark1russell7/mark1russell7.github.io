import { describe, expect, test } from "vitest";
import discovered from "./discovered.json" with { type: "json" };
import { autoSite } from "./content.ts";
import { addressOf, type Move, moveOf, movedOf, moveProblems, movePage, movePages, moves, notFoundPage, pagesAddress, redirectScript, withFound, writtenMoves } from "./moves.ts";

const list: readonly Move[] = [
  { repo: "codeatlas", to: "https://example.org/codeatlas/", movedAt: "2026-11-17" },
  { repo: "Funk", to: "https://example.org/Funk/", movedAt: "2026-11-17" },
  // A planned move: GitHub has not moved the repository, so its site is still at the old path.
  { repo: "plan", to: "https://example.org/plan/" },
];

/** This function starts a redirect script with a false location, and gives the address of its replace, or null. */
function redirect(script: string, url: string): string | null {
  const { pathname, search, hash } = new URL(url, "https://mark1russell7.github.io");
  let to: string | null = null;
  const location = { pathname, search, hash, replace: (address: string) => (to = address) };
  new Function("location", script)(location);
  return to;
}

describe("moves", () => {
  test.each([
    ["/codeatlas/", "https://example.org/codeatlas/"],
    ["/codeatlas", "https://example.org/codeatlas/"],
    ["/CodeAtlas/clones/a.html", "https://example.org/codeatlas/clones/a.html"],
    ["/funk/x/", "https://example.org/Funk/x/"],
    ["/plan/", "/plan/"],
    ["/plan/a.html", "/plan/a.html"],
    ["/codeatlasx/", "/codeatlasx/"],
    ["/packing/", "/packing/"],
    ["/", "/"],
  ])("the address of %s is %s", (path, address) => {
    expect(addressOf(path, list)).toBe(address);
  });

  test("the script gives the same address as addressOf after the move, with the query and the fragment", () => {
    // The script sends each listed move away, also a planned one. GitHub Pages serves it only after the transfer, when no site has the path.
    const script = redirectScript(list);
    const after = list.map((move) => ({ ...move, movedAt: "2026-11-17" }));
    for (const path of ["/codeatlas/", "/codeatlas", "/CODEATLAS/a/b", "/Funk/x", "/plan/b", "/codeatlasx/", "/packing/", "/"]) {
      const moved = moveOf(path, list) !== undefined;
      expect(redirect(script, `${path}?q=1#top`)).toBe(moved ? `${addressOf(path, after)}?q=1#top` : null);
    }
  });

  test("a planned move keeps the old path for the card, and its pages are ready for the transfer (11-17)", () => {
    // On 11-16 the card of codeatlas loaded its new address before the transfer, and the new address gave a 404.
    const plan = list[2] as Move;
    expect(moveOf("/plan/", list)).toBe(plan);
    expect(movedOf("/plan/", list)).toBeUndefined();
    expect(movedOf("/codeatlas/", list)).toBe(list[0]);
    expect(movePage(plan)).toContain(`<meta http-equiv="refresh" content="0; url=${plan.to}">`);
    const script = /<script>\n([\s\S]*?)\n<\/script>/.exec(notFoundPage(list))?.[1] ?? "";
    expect(redirect(script, "/plan/a")).toBe("https://example.org/plan/a");
  });

  test("the page of an old path has a canonical link, a refresh, a link and its script", () => {
    const move = list[0] as Move;
    const html = movePage(move);
    expect(html).toContain(`<link rel="canonical" href="${move.to}">`);
    expect(html).toContain(`<meta http-equiv="refresh" content="0; url=${move.to}">`);
    expect(html).toContain(`<a href="${move.to}">`);
    const script = /<script>\n([\s\S]*?)\n<\/script>/.exec(html)?.[1] ?? "";
    expect(redirect(script, "/codeatlas/?q#f")).toBe(`${move.to}?q#f`);
  });

  test("a move gives a page at its old path and at each of its paths, each with the address of the same page (11-17)", () => {
    // A form names the texts pages of a site. The 404.html gives them the status 404, so each gets a page of its own.
    const move: Move = { repo: "alerts", to: "https://example.org/alerts/", paths: ["texts/privacy/", "texts/opt-in/"] };
    const files = movePages(move);
    expect(files.map((file) => file.fileName)).toEqual(["alerts/index.html", "alerts/texts/privacy/index.html", "alerts/texts/opt-in/index.html"]);
    expect(files[0]?.source).toBe(movePage(move));
    const privacy = files[1]?.source ?? "";
    expect(privacy).toContain(`<link rel="canonical" href="https://example.org/alerts/texts/privacy/">`);
    expect(privacy).toContain(`<meta http-equiv="refresh" content="0; url=https://example.org/alerts/texts/privacy/">`);
    expect(privacy).toContain(`<a href="https://example.org/alerts/texts/privacy/">`);
    const script = /<script>\n([\s\S]*?)\n<\/script>/.exec(privacy)?.[1] ?? "";
    expect(redirect(script, "/alerts/texts/privacy/?a#b")).toBe("https://example.org/alerts/texts/privacy/?a#b");
    expect(movePages({ repo: "x", to: "https://example.org/x/" }).map((file) => file.fileName)).toEqual(["x/index.html"]);
  });

  test("the 404 page sends each moved subpath away and keeps each other path", () => {
    const html = notFoundPage(list);
    expect(html).toContain(`<meta name="robots" content="noindex">`);
    const script = /<script>\n([\s\S]*?)\n<\/script>/.exec(html)?.[1] ?? "";
    expect(redirect(script, "/funk/a")).toBe("https://example.org/Funk/a");
    expect(redirect(script, "/nothing/")).toBeNull();
  });

  test("the script data cannot close the script element", () => {
    expect(redirectScript([{ repo: "x", to: "https://example.org/</script>/" }])).not.toContain("</script>");
  });

  test("each move has a new address with a slash at the end, and no move has a second entry", () => {
    for (const move of moves) expect(move.to).toMatch(/^https:\/\/[^/]+\/.+\/$/);
    for (const move of moves) if (move.movedAt !== undefined) expect(move.movedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // A path is relative to the old site, with a slash at the end, and it names no parent folder.
    for (const move of moves) for (const path of move.paths ?? []) expect(path).toMatch(/^([a-z0-9][a-z0-9-]*\/)+$/);
    for (const move of moves) expect(new Set(move.paths ?? []).size).toBe((move.paths ?? []).length);
    expect(new Set(moves.map((move) => move.repo.toLowerCase())).size).toBe(moves.length);
  });
});

// P22: the discovery reads each owner. A repository that moves to another owner keeps its card at the Pages host of that owner.
describe("the sites of each owner", () => {
  const found = [
    { repo: "plan", owner: "metrograph-labs" },
    { repo: "fresh", owner: "Metrograph-Labs" },
    { repo: "codeatlas", owner: "metrograph-labs" },
    { repo: "stay", owner: "mark1russell7" },
    { repo: "old" },
  ];

  test("a planned move takes effect when the discovery finds the repository at the new owner", () => {
    const after = withFound(list, found);
    expect(movedOf("/plan/", list)).toBeUndefined();
    expect(movedOf("/plan/x", after)?.found).toBe(true);
    expect(addressOf("/plan/x", after)).toBe("https://example.org/plan/x");
  });

  test("a site of another owner with no written move gets the Pages address of its owner", () => {
    const after = withFound(list, found);
    expect(addressOf("/fresh/", after)).toBe("https://metrograph-labs.github.io/fresh/");
    expect(addressOf("/stay/", after)).toBe("/stay/");
    expect(addressOf("/old/", after)).toBe("/old/");
    expect(after.filter((move) => move.repo === "codeatlas")).toHaveLength(1);
  });

  test("the card of a site of each owner links to the repository of its owner", () => {
    expect(autoSite({ repo: "fresh", owner: "metrograph-labs", path: "/fresh/", description: "A site." }, 0).repo).toBe("https://github.com/metrograph-labs/fresh");
    expect(autoSite({ repo: "stay", owner: "mark1russell7", path: "/stay/", description: "A site." }, 0).repo).toBe("https://github.com/mark1russell7/stay");
    expect(autoSite({ repo: "old", path: "/old/", description: "A site." }, 0).repo).toBe("https://github.com/mark1russell7/old");
  });

  test("a written move that the discovery contradicts is a problem", () => {
    const written: Move[] = [
      { repo: "stay", to: "https://metrograph-labs.github.io/stay/", movedAt: "2026-11-24" },
      { repo: "fresh", to: "https://example.org/fresh/", movedAt: "2026-11-24" },
      { repo: "old", to: "https://metrograph-labs.github.io/old/", movedAt: "2026-11-24" },
    ];
    expect(moveProblems(written, found)).toEqual([
      "stay: the move has the day 2026-11-24, but the discovery finds the repository at mark1russell7",
      "fresh: the move goes to https://example.org/fresh/, but the site of Metrograph-Labs/fresh is at https://metrograph-labs.github.io/fresh/",
    ]);
    expect(pagesAddress("Metrograph-Labs", "fresh")).toBe("https://metrograph-labs.github.io/fresh/");
  });

  test("the written moves agree with the discovered list", () => {
    expect(moveProblems(writtenMoves, discovered)).toEqual([]);
  });

  test("the discovered list holds a site of each owner, and each moved site of the list is at its owner", () => {
    const owners = new Set(discovered.map((f) => (f as { owner?: string }).owner));
    expect([...owners].sort()).toEqual(["mark1russell7", "metrograph-labs"]);
    for (const f of discovered as { repo: string; owner?: string; path: string }[]) {
      if (f.owner && f.owner !== "mark1russell7") expect(addressOf(f.path)).toBe(pagesAddress(f.owner, f.repo));
    }
  });
});
