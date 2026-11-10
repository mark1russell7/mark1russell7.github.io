import discovered from "./discovered.json" with { type: "json" };

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

/** The size of the viewport in the frame of a site, before the frame scales it. */
export const FRAME_WIDTH = 1280;
export const FRAME_HEIGHT = 800;

const github = "https://github.com/mark1russell7";

/** A public repository with a GitHub Pages site, as `scripts/discover.ts` found it. */
export interface Discovered {
  readonly repo: string;
  readonly path: string;
  readonly description: string;
}

/**
 * The projects with a written card, in the order of the lists for search engines. The first projects are about reliability and tools for AI agents.
 * The pool shows the tier 1 projects in its two large places.
 */
export const curated: readonly Site[] = [
  {
    kind: "site",
    id: "systems",
    name: "systems",
    path: "/systems/",
    tagline: "Time to detect a dead peer",
    blurb: "How long until a client knows that its peer is gone. An algebra calculates the time, and a harness measures it.",
    hue: "#93D86C",
    tier: 1,
    focus: ".sy-frame",
    repo: `${github}/systems`,
  },
  {
    kind: "site",
    id: "client",
    name: "client",
    path: "/client/",
    tagline: "Procedures as data",
    blurb: "Procedures as data. One typed registry for the CLI, HTTP, WebSocket and the MCP tools of Claude.",
    hue: "#A78CFF",
    tier: 1,
    poster: "/client/og/index.png",
    repo: `${github}/client`,
  },
  {
    kind: "site",
    id: "crawler",
    name: "polite-crawler",
    path: "/crawler/",
    tagline: "Fetch once. Read many times.",
    blurb: "A polite web crawler for research and AI agents. It fetches a source once, keeps it, and gives full-text search and an MCP server.",
    hue: "#D9E04F",
    tier: 2,
    poster: "/crawler/og.png",
    repo: `${github}/crawler`,
  },
  {
    kind: "site",
    id: "lag",
    name: "lag",
    path: "/lag/",
    tagline: "Main-thread lag as OTel metrics and traces",
    blurb: "It measures how long the main thread makes users wait, and exports the result as OpenTelemetry metrics and traces.",
    hue: "#F2AA3C",
    tier: 2,
    poster: "/lag/og/index.png",
    repo: `${github}/lag`,
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
  {
    kind: "site",
    id: "async-browser-context",
    name: "async-browser-context",
    path: "/AsyncBrowserContext/",
    tagline: "AsyncLocalStorage for the browser",
    blurb: "AsyncLocalStorage for the browser. The context stays through await, timers, events and generators.",
    hue: "#2CC9B5",
    tier: 2,
    focus: "[class*='_debugger_']",
    poster: "/AsyncBrowserContext/og/index.png",
    repo: `${github}/AsyncBrowserContext`,
  },
  {
    kind: "site",
    id: "vex",
    name: "Vex",
    path: "/vex/",
    tagline: "Typed spreadsheet formulas over TS objects",
    blurb: "Typed spreadsheet formulas over TypeScript objects. When a value is missing, Vex tells you why.",
    hue: "#5B86FF",
    tier: 2,
    poster: "/vex/og.png",
    repo: `${github}/vex`,
  },
  {
    kind: "site",
    id: "coeval",
    name: "coeval",
    path: "/coeval/",
    tagline: "A base for declarative languages",
    blurb: "A base for declarative languages. A document gets its meaning from a question. Its kind names the evaluator, and a ladder finds it.",
    hue: "#FFB3C7",
    tier: 2,
    repo: `${github}/coeval`,
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
    id: "splay",
    name: "splay",
    path: "/splay/",
    tagline: "Any data, one viewer for each type",
    blurb: "It renders any data with one viewer for each type. The core has no dependencies. Edit the JSON, and see splay render it as HTML elements, plain strings or component data.",
    hue: "#FF9F5A",
    tier: 2,
    focus: "#playground",
    repo: `${github}/splay`,
  },
  {
    kind: "site",
    id: "splay-react",
    name: "splay-react",
    path: "/splay-react/",
    tagline: "Data to JSON, then to React elements",
    blurb: "The React adapter of splay. It renders any data to plain JSON, then hydrates the JSON to React elements. Change the data or a viewer, and see the two phases change live.",
    hue: "#34B88A",
    tier: 2,
    focus: "#demo",
    repo: `${github}/splay-react`,
  },
  {
    kind: "site",
    id: "ireko",
    name: "ireko",
    path: "/ireko/",
    tagline: "A layout for each box of a diagram",
    blurb: "Composable graph and tree layout for TypeScript. Each container selects its own layout, and SVG, Canvas, the DOM or React Flow draws the result.",
    hue: "#56CCF2",
    tier: 2,
    focus: ".ik-live",
    poster: "/ireko/og/index.png",
    repo: `${github}/ireko`,
  },
  {
    kind: "site",
    id: "highways",
    name: "highways",
    path: "/highways/",
    tagline: "Edge routes on a tree of highways",
    blurb: "It routes the edges of large graphs with highways, bundles and zoom levels. Pick a router and a fixture, and your browser routes the map live.",
    hue: "#EE7BD0",
    tier: 2,
    focus: ".stage",
    repo: `${github}/highways`,
  },
  {
    kind: "site",
    id: "packing",
    name: "packing",
    path: "/packing/",
    tagline: "Rectangle packing, live",
    blurb: "It packs rectangles into a container with many strategies, and measures each layout with an algebra. Change the strategy, the sort and the width, and compare the layouts in your browser.",
    hue: "#7FDBCA",
    tier: 2,
    focus: "#stages",
    repo: `${github}/packing`,
  },
  {
    kind: "site",
    id: "layout-contract",
    name: "layout-contract",
    path: "/layout-contract/",
    tagline: "One benchmark for packing and highways",
    blurb: "It is the shared contract of the packing and highways layout engines. It shows the newest joint benchmark, an explorer of the strategy space, the sweeps and the news of the two engines.",
    hue: "#E8A87C",
    tier: 2,
    focus: "#bench",
    repo: `${github}/layout-contract`,
  },
  {
    kind: "site",
    id: "strategy-space",
    name: "strategy-space",
    path: "/strategy-space/",
    tagline: "Layout strategies as data",
    blurb: "It writes a layout strategy as data: the stages of an engine, the options of each stage and the ranges of their params. A generator makes the configs of the space, so a new combination needs no new code.",
    hue: "#9B8CF2",
    tier: 2,
    focus: ".lead",
    repo: `${github}/strategy-space`,
  },
  {
    kind: "site",
    id: "files",
    name: "files",
    path: "/files/",
    tagline: "Paths and globs on node: alone",
    blurb: "Plain functions for the home folder, a path inside a folder, find-up, glob patterns and file walks with excludes. They use only the node: modules. The site has a glob tester.",
    hue: "#4FC3A1",
    tier: 2,
    focus: ".lead",
    repo: `${github}/files`,
  },
  {
    kind: "site",
    id: "text",
    name: "text",
    path: "/text/",
    tagline: "Plain text helpers",
    blurb: "The escapes for HTML, attributes, regular expressions and Markdown, in one package. Case conversion, padding, templates and English word forms come next. The site shows each escape of your text.",
    hue: "#F2D06B",
    tier: 2,
    focus: ".lead",
    repo: `${github}/text`,
  },
  {
    kind: "site",
    id: "codeatlas",
    name: "codeatlas",
    path: "/codeatlas/",
    tagline: "A map of the copied code",
    blurb: "It finds the code that is the same in 37 public repositories. It shows the clone classes that go across repositories, the shapes of the functions, the shared names and the packages by purpose.",
    hue: "#E05A8A",
    tier: 2,
    focus: "#app",
    repo: `${github}/codeatlas`,
  },
  {
    kind: "site",
    id: "rigor",
    name: "rigor",
    path: "/rigor/",
    tagline: "Seeded numbers, measured claims",
    blurb: "It gives shared libraries for measured work: seeded generators and statistics now, with gates, test generation, chaos and load next. Type a seed, and the page draws the same numbers in each browser.",
    hue: "#FFD166",
    tier: 2,
    focus: "#try",
    repo: `${github}/rigor`,
  },
  {
    kind: "site",
    id: "algebra",
    name: "algebra",
    path: "/algebra/",
    tagline: "One expression, many evaluators",
    blurb: "An expression is one document, and many evaluators read it: a float with an error bound, an exact rational and an interval. Each evaluator states its error. The first census examines 194 million geometric predicate tests.",
    hue: "#CD81F8",
    tier: 2,
    focus: "#census",
    repo: `${github}/algebra`,
  },
  {
    kind: "site",
    id: "headroom",
    name: "headroom",
    path: "/headroom/",
    tagline: "Memory leases for the jobs of one computer",
    blurb: "It keeps the memory and the processors of one computer free enough for its jobs. A small daemon observes the memory, grants leases and enforces their limits. A job waits in a queue until its lease has room.",
    hue: "#56D28C",
    tier: 2,
    focus: "main ol",
    repo: `${github}/headroom`,
  },
  {
    kind: "site",
    id: "lag-hud",
    name: "lag-hud",
    path: "/lag-hud/",
    tagline: "A meter and a display for the lag monitors",
    blurb: "It adds to lag, which measures the main thread of a page. It gives an in-memory meter for the lag monitors, a fan-out to more meters and a display without a framework.",
    hue: "#ACDD4B",
    tier: 2,
    focus: "main",
    repo: `${github}/lag-hud`,
  },
  {
    kind: "site",
    id: "optional",
    name: "optional",
    path: "/optional/",
    tagline: "Some or none, with the laws as tests",
    blurb: "A value that is present (some) or absent (none). It replaces null, undefined and exceptions in a total evaluation. Tests check the functor and monad laws, and Vex and render use it.",
    hue: "#868AF3",
    tier: 2,
    focus: "main",
    repo: `${github}/optional`,
  },
  {
    kind: "site",
    id: "release-train",
    name: "release-train",
    path: "/release-train/",
    tagline: "npm releases in dependency order",
    blurb: "It reads the npm packages of each repository and makes their dependency graph. It plans the next releases and updates in topological order. Its apply stage opens one combined update pull request for each repository.",
    hue: "#4FA1EE",
    tier: 2,
    focus: "main table",
    repo: `${github}/release-train`,
  },
  {
    kind: "site",
    id: "ste-lint",
    name: "ste-lint",
    path: "/ste-lint/",
    tagline: "A linter for Simplified Technical English",
    blurb: "It finds prose that does not obey the writing rules of ASD-STE100 Simplified Technical English. It examines Markdown, MDX and TypeScript doc comments. It is an approximation, not a certification.",
    hue: "#E67BEA",
    tier: 2,
    focus: "main table",
    repo: `${github}/ste-lint`,
  },
  {
    kind: "site",
    id: "template",
    name: "template",
    path: "/template/",
    tagline: "The template of each repository",
    blurb: "It holds the shared CI, release and Pages workflows of the repositories. Its packages check the conventions and the import boundaries, report the public API and make new repositories.",
    hue: "#69D369",
    tier: 2,
    focus: "main",
    repo: `${github}/template`,
  },
  {
    kind: "site",
    id: "typeset",
    name: "typeset",
    path: "/typeset/",
    tagline: "Text widths from the font tables",
    blurb: "It reads the glyph widths and the kerning pairs from the tables of a font file. It calculates the width of a text without a draw operation. The site compares each width with canvas measureText.",
    hue: "#7058EC",
    tier: 2,
    focus: "#lab",
    repo: `${github}/typeset`,
  },
  {
    kind: "site",
    id: "concat-src",
    name: "concat-src",
    path: "/concat-src/",
    tagline: "A folder of source in one Markdown file",
    blurb: "It walks a folder and keeps the source files by extension and by end pattern. Then it writes the rules, a directory tree and each kept file in a code fence into one Markdown file. The site makes the catalog of a sample project or of your own folder, and the files stay in your browser.",
    hue: "#C9A0FF",
    tier: 2,
    focus: "#try",
    repo: `${github}/concat-src`,
  },
  {
    kind: "site",
    id: "cue",
    name: "cue",
    path: "/cue/",
    tagline: "Package files from a list of features",
    blurb: "Each package lists its features, for example ts, node, react and vitest. The CLI cue-config adds the features that they need. Then CUE unifies the file of each feature into package.json, tsconfig.json and .gitignore. Each package of the client monorepo uses it. The playground shows each line that generate writes, and the feature that gave the line.",
    hue: "#3FD4DB",
    tier: 2,
    focus: "#playground",
    repo: `${github}/cue`,
  },
  {
    kind: "site",
    id: "docker-mongo",
    name: "docker-mongo",
    path: "/docker-mongo/",
    tagline: "A MongoDB container from eight variables",
    blurb: "A MongoDB 8.0 container for Docker Compose, with TypeScript functions that connect, initialize and seed. Eight environment variables give the connection string and the Compose file, and the file never holds the password. The site shows each step of init and seed as a mongosh command, with no server.",
    hue: "#F25C6E",
    tier: 2,
    focus: "#try",
    repo: `${github}/docker-mongo`,
  },
  {
    kind: "site",
    id: "docker-sqlite",
    name: "docker-sqlite",
    path: "/docker-sqlite/",
    tagline: "SQLite for Node.js with no native build",
    blurb: "SQLite for Node.js on sql.js, so it needs no native build. It gives functions for queries and migrations, and it writes a database file only when the content changed. A Compose file starts the sqlite-web interface on the loopback address. The site runs real SQLite in your browser. Edit a migration, start it, and read the SQL of each call in the log.",
    hue: "#B8C2EA",
    tier: 2,
    focus: "#try",
    repo: `${github}/docker-sqlite`,
  },
  {
    kind: "site",
    id: "funk",
    name: "Funk",
    path: "/Funk/",
    tagline: "Small functional parts for TypeScript",
    blurb: "Small functional parts for TypeScript, with no dependencies. It has Either and Optional for failures and absent values, a collection on arrays and sets, and a sponge that fills an object in steps. It is not on npm. The site starts the real source in your browser. Fail a step of a chain, and the later steps do not start.",
    hue: "#F2C14E",
    tier: 2,
    focus: "#railway",
    repo: `${github}/Funk`,
  },
  {
    kind: "site",
    id: "grafana-infra",
    name: "grafana-infra",
    path: "/grafana-infra/",
    tagline: "Frontend observability in Docker Compose",
    blurb: "A Docker Compose stack for frontend observability, with Alloy, Mimir, Loki, Tempo, Pyroscope and Grafana. The lag library uses it for development and integration tests, and the stack provisions the Lag Monitor dashboard. The site reads the real config files, but the stack does not operate on the page. Follow a signal to Grafana, find which panel reads which rule, and change a port.",
    hue: "#F47A3F",
    tier: 2,
    focus: "#map",
    repo: `${github}/grafana-infra`,
  },
  {
    kind: "site",
    id: "logger",
    name: "Logger",
    path: "/Logger/",
    tagline: "A TypeScript logger with no dependencies",
    blurb: "A logger for TypeScript with no dependencies. It has five levels, child loggers, three formatters, and console, memory, callback and custom transports. If a transport fails, the next transport still gets the record. The site starts the real package in your browser. Send a record, and follow it through the filter, the formatter and the transports.",
    hue: "#9AD1D4",
    tier: 2,
    focus: "#lab",
    repo: `${github}/Logger`,
  },
  {
    kind: "site",
    id: "otel-ts",
    name: "otel-ts",
    path: "/otel-ts/",
    tagline: "OpenTelemetry for web apps in one call",
    blurb: "OpenTelemetry for TypeScript web apps from one init() call, with Grafana Faro as an option. It starts traces, metrics and logs, and it sends them with OTLP over HTTP. It flushes the data each time the page becomes hidden. The site starts the real init() in your browser and shows each span, metric and log record that leaves the package. The data stays in your browser.",
    hue: "#7B9BF0",
    tier: 2,
    focus: "#lab",
    repo: `${github}/otel-ts`,
  },
  {
    kind: "site",
    id: "pr-opener",
    name: "pr-opener",
    path: "/pr-opener/",
    tagline: "Open a pull request from the URL bar",
    blurb: "A Chrome extension. Type pull in the URL bar, press Tab, type a pull request number and press Enter. The options page keeps a list of repositories, and the first one is the default. It is not in the Chrome Web Store, so you build it and load the folder. The site starts the real extension code in your browser, with a drawn URL bar.",
    hue: "#5CC8A1",
    tier: 2,
    focus: "#try",
    repo: `${github}/pr-opener`,
  },
  {
    kind: "site",
    id: "ts-base",
    name: "ts-base",
    path: "/ts-base/",
    tagline: "Strict tsconfig presets, traced to each file",
    blurb: "Strict tsconfig presets that build on each other: one file has the shared rules, and small files add ESM, CommonJS or frontend settings. Its CLI writes a tsconfig.json with one extends line and sets up package.json. The site traces each setting of a merged tsconfig to its file. Switch a strict flag, and read the code that tsc refuses. The results come from the real compiler at build time.",
    hue: "#6BB5FF",
    tier: 2,
    focus: "#try",
    repo: `${github}/ts-base`,
  },
  {
    kind: "site",
    id: "tinyimages",
    name: "TinyImages",
    path: "/TinyImages/",
    tagline: "The smallest files that image parsers take",
    blurb: "A museum of very small image files, from a 5-byte SVG and a 35-byte GIF to a file that is also a shell script. The site tests each file in your browser. In its shrink lab you change the bytes, and the page shows if your browser still takes the result.",
    hue: "#D4B483",
    tier: 2,
    focus: "#lab",
    repo: `${github}/TinyImages`,
  },
  {
    kind: "site",
    id: "meds",
    name: "Meds",
    path: "/Meds/",
    tagline: "A phone app for the next dose, live in your browser",
    blurb: "The real Meds app runs in a phone frame, with invented sample items. Hold a tile, drag the hour wheel and move the clock. The page then shows how the state machine and the schedule code answer. Everything stays in your browser.",
    hue: "#7FD1AE",
    tier: 2,
    focus: "#try",
    repo: `${github}/Meds`,
  },
  {
    kind: "site",
    id: "collections",
    name: "collections",
    path: "/collections/",
    tagline: "TypeScript collections with no dependencies",
    blurb: "Pure collections for TypeScript, with no dependencies: lists, maps, queues, a summary tree, channels, lazy operations and dependency graphs. One package holds them all.",
    hue: "#B79CED",
    tier: 2,
    focus: "main",
    repo: `${github}/collections`,
  },
  {
    kind: "site",
    id: "runner-dispatch",
    name: "runner-dispatch",
    path: "/runner-dispatch/",
    tagline: "One new machine for each trusted CI job",
    blurb: "A dispatcher gives a waiting GitHub Actions job a new machine for that job only, after its trust rules pass. A pull request from a fork cannot reach the machine with a label. The first package has the records, the trust rules and the check on the machine.",
    hue: "#62B6D9",
    tier: 2,
    focus: ".lead",
    repo: `${github}/runner-dispatch`,
  },
  {
    kind: "site",
    id: "cluster-design",
    name: "cluster-design",
    path: "/cluster-design/",
    tagline: "A computer cluster as formulas with units",
    blurb: "A cluster design is data: the parts of each machine, the rules that tell which parts fit, and a site with its circuits. Formulas give the capacity, the watts, the heat, the noise and the load of each circuit. The first package is not written yet.",
    hue: "#D98F4E",
    tier: 2,
    focus: ".lead",
    repo: `${github}/cluster-design`,
  },
  {
    kind: "site",
    id: "market",
    name: "market",
    path: "/market/",
    tagline: "Offers and price history from many sellers",
    blurb: "A live catalog of products, with the offers of many sellers and the price of each offer over time. Each seller has one adapter, and the official API of the seller comes first. The first package is not written yet.",
    hue: "#EF8FA6",
    tier: 2,
    focus: ".lead",
    repo: `${github}/market`,
  },
  {
    kind: "site",
    id: "room-view",
    name: "room-view",
    path: "/room-view/",
    tagline: "A room in 3D, with its objects and circuits",
    blurb: "A three.js viewer of a room model from a glTF file. The placed objects, the outlets and the circuits are data, so a program can make many scenes for a person to compare. The first package is not written yet.",
    hue: "#8EA6F5",
    tier: 2,
    focus: ".lead",
    repo: `${github}/room-view`,
  },
];

/**
 * This function gives an automatic card for a site that `curated` does not describe. The text comes from the description of the repository.
 * The card takes the hue of a written card, in turn.
 */
export function autoSite(found: Discovered, index: number): Site {
  const text = found.description || `The site of ${found.repo}.`;
  const first = (text.split(/(?<=\.)\s/)[0] ?? text).replace(/\.$/, "");
  return {
    kind: "site",
    id: found.repo.toLowerCase(),
    name: found.repo,
    path: found.path,
    tagline: first.length > 48 ? `${first.slice(0, 47).trimEnd()}…` : first,
    blurb: text,
    hue: curated[index % curated.length]?.hue ?? "#93D86C",
    tier: 2,
    repo: `${github}/${found.repo}`,
  };
}

/** This function gives the written cards, then an automatic card for each found site that has no written card. */
export function mergeSites(written: readonly Site[], found: readonly Discovered[]): Site[] {
  const paths = new Set(written.map((site) => site.path.toLowerCase()));
  return [...written, ...found.filter((f) => !paths.has(f.path.toLowerCase())).map(autoSite)];
}

/** All projects with a site. The Pages workflow finds the sites again before each build, so a new site shows without a change here. */
export const sites: readonly Site[] = mergeSites(curated, discovered);

export const tiles: readonly Tile[] = [
  { kind: "tile", id: "me", name: "Mark Russell", hue: "#E6F0EC" },
  { kind: "tile", id: "proof", name: "The numbers", hue: "#2CC9B5" },
  { kind: "tile", id: "now", name: "Recent work", hue: "#F2AA3C" },
  { kind: "tile", id: "meter", name: "This page", hue: "#FF7C6C" },
];

export const pebbles: readonly Pebble[] = [];

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
  lede: "I build reliability tooling and infrastructure for AI agents.",
  body: [
    "I am a software engineer on the platform team at Tulip. Before that, I was its Tier 3 support engineer.",
    "The projects here measure TCP failure detection and browser lag, and give Claude tools with clear limits.",
  ],
};

export const links: { readonly linkedin: string; readonly github: string; readonly npm: string } = {
  linkedin: "https://www.linkedin.com/in/mark-russell-3bb1b5155/",
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
