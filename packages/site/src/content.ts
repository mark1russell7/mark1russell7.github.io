/** A project with its own site under this domain. The pool shows the site live in a frame. */
export interface Site {
  readonly kind: "site";
  readonly id: string;
  readonly name: string;
  /** The path of the site under this domain, with the slash at the end. */
  readonly path: string;
  /** One short line for the caption of the card. */
  readonly tagline: string;
  /** The full description. The panel of an open site, the label for screen readers and the data for search engines use it. */
  readonly blurb: string;
  readonly hue: string;
  /** Tier 1 is a featured project. The pool shows it larger. */
  readonly tier: 1 | 2;
  /** A selector in the site. The frame scrolls this element to its center after the site loads. */
  readonly focus?: string;
  /** The social image of the site. The frame shows it while the site loads. */
  readonly poster?: string;
  readonly repo: string;
}

/** A card with facts about the author, not a project. */
export interface Tile {
  readonly kind: "tile";
  readonly id: "me" | "proof" | "now" | "meter";
  readonly name: string;
  readonly hue: string;
}

/** A small repository without its own site. Its link goes to GitHub. */
export interface Pebble {
  readonly kind: "pebble";
  readonly id: string;
  readonly name: string;
  readonly blurb: string;
  readonly hue: string;
  readonly href: string;
}

export type Item = Site | Tile | Pebble;

const github = "https://github.com/mark1russell7";

export const sites: readonly Site[] = [
  {
    kind: "site",
    id: "vex",
    name: "Vex",
    path: "/vex/",
    tagline: "Typed spreadsheet formulas over TS objects",
    blurb: "Typed spreadsheet formulas over TypeScript objects. When a value is missing, Vex tells you why.",
    hue: "#5B86FF",
    tier: 1,
    poster: "/vex/og.png",
    repo: `${github}/vex`,
  },
  {
    kind: "site",
    id: "async-browser-context",
    name: "async-browser-context",
    path: "/AsyncBrowserContext/",
    tagline: "AsyncLocalStorage for the browser",
    blurb: "AsyncLocalStorage for the browser. The context stays through await, timers, events and generators.",
    hue: "#2CC9B5",
    tier: 1,
    focus: "[class*='_debugger_']",
    poster: "/AsyncBrowserContext/og/index.png",
    repo: `${github}/AsyncBrowserContext`,
  },
  {
    kind: "site",
    id: "lag",
    name: "lag",
    path: "/lag/",
    tagline: "Main-thread lag as OTel metrics",
    blurb: "It measures how long the main thread makes users wait, and exports the result as OpenTelemetry metrics.",
    hue: "#F2AA3C",
    tier: 2,
    repo: `${github}/lag`,
  },
  {
    kind: "site",
    id: "client",
    name: "client",
    path: "/client/",
    tagline: "Procedures as data",
    blurb: "Procedures as data. One typed registry for the CLI, HTTP, WebSocket and the MCP tools of Claude.",
    hue: "#A78CFF",
    tier: 2,
    repo: `${github}/client`,
  },
  {
    kind: "site",
    id: "render",
    name: "render",
    path: "/render/",
    tagline: "A reactive engine that edits itself",
    blurb: "A reactive expression engine. Its interface shows its own expressions, and you can edit them.",
    hue: "#FF7C6C",
    tier: 2,
    focus: ".rd-frame",
    repo: `${github}/render`,
  },
  {
    kind: "site",
    id: "systems",
    name: "systems",
    path: "/systems/",
    tagline: "Time to detect a dead peer",
    blurb: "How long until a client knows that its peer is gone. An algebra calculates the time, and a harness measures it.",
    hue: "#93D86C",
    tier: 2,
    focus: ".sy-frame",
    repo: `${github}/systems`,
  },
  {
    kind: "site",
    id: "page-lifecycle-tracker",
    name: "page-lifecycle-tracker",
    path: "/page-lifecycle-tracker/",
    tagline: "Page Lifecycle state for telemetry",
    blurb: "The Page Lifecycle state of a web page, from active to frozen, for monitoring and telemetry libraries.",
    hue: "#EE7BD0",
    tier: 2,
    repo: `${github}/page-lifecycle-tracker`,
  },
];

export const tiles: readonly Tile[] = [
  { kind: "tile", id: "me", name: "Mark Russell", hue: "#E6F0EC" },
  { kind: "tile", id: "proof", name: "The numbers", hue: "#2CC9B5" },
  { kind: "tile", id: "now", name: "Recent work", hue: "#F2AA3C" },
  { kind: "tile", id: "meter", name: "This page", hue: "#FF7C6C" },
];

export const pebbles: readonly Pebble[] = [
  { kind: "pebble", id: "ste-lint", name: "ste-lint", blurb: "A linter for technical prose", hue: "#A78CFF", href: `${github}/ste-lint` },
  { kind: "pebble", id: "optional", name: "optional", blurb: "Some or none, law-tested", hue: "#5B86FF", href: `${github}/optional` },
  { kind: "pebble", id: "cue", name: "cue", blurb: "Shared TS config schemas", hue: "#93D86C", href: `${github}/cue` },
  { kind: "pebble", id: "otel-ts", name: "otel-ts", blurb: "OpenTelemetry in one call", hue: "#F2AA3C", href: `${github}/otel-ts` },
  { kind: "pebble", id: "template", name: "template", blurb: "The workspace template", hue: "#FF7C6C", href: `${github}/template` },
];

export const items: readonly Item[] = [...sites, ...tiles, ...pebbles];

/** The numbers of the proof tile. Each number comes from a project site. */
export const proof: readonly { readonly value: string; readonly label: string }[] = [
  { value: "98%", label: "mutation score of async-browser-context" },
  { value: "4.3 kB", label: "browser runtime, with gzip" },
  { value: "155", label: "CLI commands in client" },
  { value: "4", label: "engines in each CI run" },
];

/** The text about the author. The "me" tile shows it, and the build writes it into the HTML for search engines. */
export const bio: { readonly lede: string; readonly body: readonly string[] } = {
  lede: "I build languages, engines and frameworks for TypeScript.",
  body: [
    "Vex is a formula language that tells you why a value is missing. render is an engine whose interface edits its own expressions. client serves one typed registry to a CLI, HTTP, WebSockets and Claude.",
    "Every project here is live. Open one and use it.",
  ],
};

export const links: { readonly github: string; readonly npm: string } = {
  github,
  npm: "https://www.npmjs.com/~mark1russell7",
};

/** This function gives the item with the identifier `id`. */
export function itemById(id: string): Item | undefined {
  return items.find((item) => item.id === id);
}

/** This function gives the hue of an item as red, green and blue values from 0 to 1. */
export function hueRgb(hue: string): [number, number, number] {
  const n = Number.parseInt(hue.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
