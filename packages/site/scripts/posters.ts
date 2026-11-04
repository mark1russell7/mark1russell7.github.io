// This script takes a picture of each live site for its card. The Pages workflow starts it after discover.ts and
// before the build, so each card has a poster and the pool loads no site until a user asks for one.
//   public/posters/<id>.webp   the poster, FRAME_WIDTH / 2 by FRAME_HEIGHT / 2
//   src/posters.json           the ids of the sites with a poster
// A card with no poster keeps its social image or its name, so a failed picture never stops a deployment.
import { mkdirSync, writeFileSync } from "node:fs";
import { type Browser, chromium } from "playwright";
import sharp from "sharp";
import { FRAME_HEIGHT, FRAME_WIDTH, type Site, sites } from "../src/content.ts";

const ORIGIN = "https://mark1russell7.github.io";
const WORKERS = 4;
const LOAD_LIMIT_MS = 30000;
/** A site gets this time after its load event, so its demo can draw. */
const SETTLE_MS = 2000;

const folder = new URL("../public/posters/", import.meta.url);
const list = new URL("../src/posters.json", import.meta.url);
mkdirSync(folder, { recursive: true });

async function capture(browser: Browser, site: Site): Promise<void> {
  const page = await browser.newPage({
    viewport: { width: FRAME_WIDTH, height: FRAME_HEIGHT },
    colorScheme: "light",
  });
  try {
    const response = await page.goto(`${ORIGIN}${site.path}`, { waitUntil: "load", timeout: LOAD_LIMIT_MS });
    if (!response?.ok()) throw new Error(`the server answered ${response?.status() ?? "nothing"}`);
    await page.waitForTimeout(SETTLE_MS);
    // The poster shows the same place in the site as the live frame, so the swap does not jump.
    await page.evaluate(
      ({ selector, height }) => {
        document.documentElement.style.scrollbarWidth = "none";
        const target = selector ? document.querySelector(selector) : null;
        if (!target) return;
        const rect = target.getBoundingClientRect();
        scrollTo({ top: Math.max(0, scrollY + rect.top + rect.height / 2 - height / 2), behavior: "instant" });
      },
      { selector: site.focus ?? null, height: FRAME_HEIGHT },
    );
    await page.waitForTimeout(300);
    const image = await sharp(await page.screenshot({ type: "png" }))
      .resize(FRAME_WIDTH / 2, FRAME_HEIGHT / 2)
      .webp({ quality: 68 })
      .toBuffer();
    writeFileSync(new URL(`${site.id}.webp`, folder), image);
  } finally {
    await page.close();
  }
}

const browser = await chromium.launch();
const queue = [...sites];
const done: string[] = [];
const failed: string[] = [];

await Promise.all(
  Array.from({ length: WORKERS }, async () => {
    for (let site = queue.shift(); site; site = queue.shift()) {
      try {
        await capture(browser, site);
        done.push(site.id);
      } catch (error) {
        failed.push(site.id);
        console.log(`::warning::posters: no poster for ${site.id}: ${String(error).slice(0, 160)}`);
      }
    }
  }),
);
await browser.close();

writeFileSync(list, JSON.stringify(done.sort(), null, 2) + "\n");
console.log(`posters: ${done.length} of ${sites.length} sites${failed.length ? `, no poster for ${failed.join(", ")}` : ""}`);
