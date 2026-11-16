import { describe, expect, test } from "vitest";
import { addressOf, type Move, moveOf, movePage, moves, notFoundPage, redirectScript } from "./moves.ts";

const list: readonly Move[] = [
  { repo: "codeatlas", to: "https://example.org/codeatlas/" },
  { repo: "Funk", to: "https://example.org/Funk/" },
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
    ["/codeatlasx/", "/codeatlasx/"],
    ["/packing/", "/packing/"],
    ["/", "/"],
  ])("the address of %s is %s", (path, address) => {
    expect(addressOf(path, list)).toBe(address);
  });

  test("the script gives the same address as addressOf, with the query and the fragment", () => {
    const script = redirectScript(list);
    for (const path of ["/codeatlas/", "/codeatlas", "/CODEATLAS/a/b", "/Funk/x", "/codeatlasx/", "/packing/", "/"]) {
      const moved = moveOf(path, list) !== undefined;
      expect(redirect(script, `${path}?q=1#top`)).toBe(moved ? `${addressOf(path, list)}?q=1#top` : null);
    }
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
    expect(new Set(moves.map((move) => move.repo.toLowerCase())).size).toBe(moves.length);
  });
});
