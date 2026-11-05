/**
 * The probe of the pool. The site check of the Pages workflow starts it in a browser at each width, before the deploy.
 * A failed check stops the deploy.
 *
 * The probe drives the core of the site: three views of one pool of sites. An address opens a site in a panel, and the
 * Escape key closes the panel.
 *
 * The site check reads this TypeScript file directly. It removes the types and the `export` line, and it starts the
 * result as the body of an async function.
 */

// The site check gives these helpers to the probe.
declare const check: (name: string, ok: unknown, detail?: unknown) => boolean;
declare const until: <T>(fn: () => T | Promise<T>, ms?: number) => Promise<T>;
declare const $: (selector: string) => Element | null;
declare const $$: (selector: string) => Element[];

const CARDS = ".concept [data-id]";
const TABS = '[aria-label="Concepts of the pool"] a';
const PANEL = '.expanded[role="dialog"]';
/** The least count of cards in a view. The pool has more sites than this count. */
const FEW = 10;

/** This function gives the name of the current tab. */
const current = (): string => $(`${TABS}[aria-current="page"]`)?.textContent?.trim() ?? "";

check("the pool has three views", $$(TABS).length === 3, $$(TABS).length);
check("the first view is the pond", await until(() => $(".concept.pond") !== null && current() === "Pond"), current());
check("the pond draws the sites", await until(() => $$(CARDS).length >= FEW), $$(CARDS).length);

// Each tab is an address, so a change of the hash is the same as a press on the tab.
for (const [id, name] of [
  ["board", "Board"],
  ["river", "River"],
  ["pond", "Pond"],
] as const) {
  location.hash = `#${id}`;
  check(`the tab ${name} opens its view`, await until(() => $(`.concept.${id}`) !== null && current() === name), current());
  check(`the view ${name} draws the sites`, await until(() => $$(CARDS).length >= FEW), $$(CARDS).length);
}

// The address opens a site in a panel. This check server has no other site, so a press on a card goes to its repository.
location.hash = "#pond/vex";
check("an address opens the panel of a site", await until(() => $(PANEL) !== null), location.hash);
check("the panel shows the site", $(`${PANEL} iframe`)?.getAttribute("src") === "/vex/", $(`${PANEL} iframe`)?.getAttribute("src"));

// The Escape key closes the panel, and the address follows.
dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
check("the Escape key closes the panel", await until(() => $(PANEL) === null), location.hash);
check("the address goes back to the view", location.hash === "#pond", location.hash);

export {};
