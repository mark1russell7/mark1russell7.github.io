import { escapeAttribute as escape } from "@mark1russell7/text";
import discovered from "./discovered.json" with { type: "json" };

/** The owner of this domain: its user site is at `https://<home>.github.io/`. */
export const home = "mark1russell7";

/** A site that the discovery found: its repository and the login of its owner. A list from before 2026-11-25 has no owner. */
export interface FoundSite {
  readonly repo: string;
  readonly owner?: string;
}

/**
 * A repository that moves, or moved, from this account to another owner. GitHub Pages serves its site at a new address.
 * The old path on this domain sends each visitor to the same page at the new address.
 */
export interface Move {
  /** The name of the repository. Its old site was at `/<repo>/` on this domain. */
  readonly repo: string;
  /** The new address of the site, with the slash at the end. */
  readonly to: string;
  /**
   * The day that GitHub moved the repository, as `YYYY-MM-DD`. A planned move has no day: its site is still at the old path, and
   * the new address gives a 404. Set the day in the first change after the transfer.
   */
  readonly movedAt?: string;
  /**
   * The subpaths of the old site that get a page of their own, each with a slash at the end, for example `texts/privacy/`.
   * GitHub Pages serves such a page with the status 200, but `404.html` with the status 404. Give each address that a form or a checker opens.
   */
  readonly paths?: readonly string[];
  /** True when the discovery found the repository at another owner. Then the site is at the new address, also with no day. */
  readonly found?: boolean;
}

/** This function gives the address of the site of a repository at the Pages host of its owner, with the slash at the end. */
export const pagesAddress = (owner: string, repo: string): string => `https://${owner.toLowerCase()}.github.io/${repo}/`;

/**
 * This function gives the moves of a written list and of the discovery. A site that the discovery finds at another owner is
 * at the Pages host of that owner. A written move of that repository gets `found`, so a planned move takes effect at the
 * first discovery after the transfer. A site with no written move gets a move of its own. Thus a moved repository keeps
 * its card with no change to this file. A new repository of another owner gets its card at its own address.
 */
export function withFound(written: readonly Move[], found: readonly FoundSite[]): Move[] {
  const away = new Map(found.filter((f) => f.owner !== undefined && f.owner.toLowerCase() !== home).map((f) => [f.repo.toLowerCase(), f]));
  const list = written.map((move) => (away.has(move.repo.toLowerCase()) ? { ...move, found: true } : move));
  const known = new Set(written.map((move) => move.repo.toLowerCase()));
  for (const [key, f] of away) if (!known.has(key)) list.push({ repo: f.repo, to: pagesAddress(f.owner as string, f.repo), found: true });
  return list;
}

/**
 * This function gives the problems of a written list against the discovery. A move that has a day, but whose repository the
 * discovery finds at the home owner, is wrong. A written address that is not the Pages address of the found owner is wrong.
 */
export function moveProblems(written: readonly Move[], found: readonly FoundSite[]): string[] {
  const byRepo = new Map(found.map((f) => [f.repo.toLowerCase(), f]));
  const problems: string[] = [];
  for (const move of written) {
    const f = byRepo.get(move.repo.toLowerCase());
    if (!f?.owner) continue;
    if (f.owner.toLowerCase() === home) {
      if (move.movedAt !== undefined) problems.push(`${move.repo}: the move has the day ${move.movedAt}, but the discovery finds the repository at ${home}`);
    } else if (move.to !== pagesAddress(f.owner, f.repo)) problems.push(`${move.repo}: the move goes to ${move.to}, but the site of ${f.owner}/${f.repo} is at ${pagesAddress(f.owner, f.repo)}`);
  }
  return problems;
}

/**
 * The repositories that move or moved. The build writes a page at each old path and a `404.html` for the old subpaths, also for
 * a planned move. Until the transfer the site of the repository has the old path, so GitHub Pages serves it and not these pages.
 * At the transfer these pages take over at once. The card, the links and the sitemap use the new address only after the day of the move.
 */
export const writtenMoves: readonly Move[] = [
  { repo: "codeatlas", to: "https://metrograph-labs.github.io/codeatlas/", movedAt: "2026-11-17" },
  // Forms and checkers open the three texts pages directly, so each gets a page with the status 200.
  { repo: "alerts", to: "https://metrograph-labs.github.io/alerts/", movedAt: "2026-11-17", paths: ["texts/opt-in/", "texts/privacy/", "texts/terms/"] },
  { repo: "capacity", to: "https://metrograph-labs.github.io/capacity/", movedAt: "2026-11-24" },
  { repo: "highways", to: "https://metrograph-labs.github.io/highways/", movedAt: "2026-11-24" },
  { repo: "ireko", to: "https://metrograph-labs.github.io/ireko/", movedAt: "2026-11-24" },
  { repo: "layout-contract", to: "https://metrograph-labs.github.io/layout-contract/", movedAt: "2026-11-24" },
  { repo: "netdiag", to: "https://metrograph-labs.github.io/netdiag/", movedAt: "2026-11-24" },
  { repo: "packing", to: "https://metrograph-labs.github.io/packing/", movedAt: "2026-11-24" },
  { repo: "systems", to: "https://metrograph-labs.github.io/systems/", movedAt: "2026-11-24" },
  { repo: "typeset", to: "https://metrograph-labs.github.io/typeset/", movedAt: "2026-11-24" },
  { repo: "vex", to: "https://metrograph-labs.github.io/vex/", movedAt: "2026-11-24" },
];

/** The written moves, and a move for each site that the discovery finds at another owner. */
export const moves: readonly Move[] = withFound(writtenMoves, discovered);

/**
 * This function gives the move of a path on this domain, or undefined. The path `/<repo>` and each path under `/<repo>/` match.
 * The match ignores the case of the letters, as GitHub Pages does for the name of a repository.
 */
export function moveOf(path: string, list: readonly Move[] = moves): Move | undefined {
  const lower = path.toLowerCase();
  return list.find((move) => {
    const old = `/${move.repo.toLowerCase()}`;
    return lower === old || lower.startsWith(`${old}/`);
  });
}

/**
 * This function gives the move of a path that GitHub did, or undefined: a move with a day, or one that the discovery found.
 * A planned move gives undefined: the site is still at the path.
 */
export function movedOf(path: string, list: readonly Move[] = moves): Move | undefined {
  const move = moveOf(path, list);
  return move?.movedAt === undefined && move?.found !== true ? undefined : move;
}

/** This function gives the address to load for a path of this domain: the new address of a moved site, or the path. */
export function addressOf(path: string, list: readonly Move[] = moves): string {
  const move = movedOf(path, list);
  return move ? move.to + path.slice(move.repo.length + 2) : path;
}

/**
 * This function gives the script that sends the visitor of an old path to the new address.
 * The script keeps the rest of the path, the query and the fragment. It has the same match as `moveOf`.
 */
export function redirectScript(list: readonly Move[]): string {
  const data = JSON.stringify(list.map((move) => ({ old: `/${move.repo.toLowerCase()}`, to: move.to }))).replace(/</g, "\\u003c");
  return [
    `(() => {`,
    `  const path = location.pathname;`,
    `  const lower = path.toLowerCase();`,
    `  for (const move of ${data}) {`,
    `    if (lower === move.old || lower.startsWith(move.old + "/")) {`,
    `      location.replace(move.to + path.slice(move.old.length + 1) + location.search + location.hash);`,
    `      return;`,
    `    }`,
    `  }`,
    `})();`,
  ].join("\n");
}

const STYLE = [
  `:root { color-scheme: light dark; font-family: system-ui, sans-serif; }`,
  `body { margin: 0; min-height: 100vh; display: grid; place-items: center; }`,
  `main { max-width: 36rem; padding: 2rem; line-height: 1.5; }`,
].join("\n");

function page(title: string, head: readonly string[], body: readonly string[]): string {
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escape(title)}</title>`,
    ...head,
    `<style>`,
    STYLE,
    `</style>`,
    `</head>`,
    `<body>`,
    `<main>`,
    ...body,
    `</main>`,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
}

/**
 * This function gives the page at an old path of a moved site: the path `/<repo>/`, or the subpath `sub` under it.
 * Search engines read its canonical link and its refresh as a move. Each points to the same page at the new address.
 * A browser with scripts goes to the same subpath, query and fragment. A browser with no scripts follows the refresh.
 */
export function movePage(move: Move, sub = ""): string {
  const to = escape(move.to + sub);
  return page(
    `${move.repo} moved`,
    [`<link rel="canonical" href="${to}">`, `<script>\n${redirectScript([move])}\n</script>`, `<meta http-equiv="refresh" content="0; url=${to}">`],
    [`<h1>${escape(move.repo)} moved</h1>`, `<p>The site of ${escape(move.repo)} moved. This page is at <a href="${to}">${to}</a>.</p>`],
  );
}

/** One file of the build: its name under the root of the site, and its HTML. */
export interface MoveFile {
  readonly fileName: string;
  readonly source: string;
}

/** This function gives the files of the old site of a move: the page at `/<repo>/`, and a page at each of its `paths`. */
export function movePages(move: Move): MoveFile[] {
  return ["", ...(move.paths ?? [])].map((sub) => ({ fileName: `${move.repo}/${sub}index.html`, source: movePage(move, sub) }));
}

/**
 * This function gives the `404.html` of the domain. GitHub Pages serves it for each path that no site has.
 * A subpath of a moved site goes to its new address. Each other path shows a link to the home page.
 */
export function notFoundPage(list: readonly Move[]): string {
  return page(
    "Page not found",
    [`<meta name="robots" content="noindex">`, `<script>\n${redirectScript(list)}\n</script>`],
    [`<h1>Page not found</h1>`, `<p>This site has no page at this address. Go to <a href="/">the home page</a>.</p>`],
  );
}
