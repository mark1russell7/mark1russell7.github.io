// Checks the deployed sites at 360 and 1280, and previews the highways table with the CSS of its branch.
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(process.env.LAG_OUT, "live-shots");
mkdirSync(out, { recursive: true });
const base = "https://mark1russell7.github.io";

const browser = await chromium.launch();

async function open(path, width) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: "light" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message.slice(0, 120)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 120));
  });
  await page.goto(`${base}${path}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  return { page, errors, close: () => context.close() };
}

const shape = (page) =>
  page.evaluate(() => ({
    pageWide: document.documentElement.scrollWidth,
    view: innerWidth,
    tables: [...document.querySelectorAll("table")].map((table) => {
      const box = table.parentElement;
      return {
        id: table.id || box.id || box.className,
        wide: table.scrollWidth,
        box: box.clientWidth,
        scrolls: box.scrollWidth > box.clientWidth + 1,
        rows: table.rows.length,
      };
    }),
    build: document.getElementById("build")?.textContent?.slice(0, 60),
  }));

// The collections site
for (const width of [360, 1280]) {
  const { page, errors, close } = await open("/collections/", width);
  const text = (id) => page.locator(id).textContent();
  await page.click('#cache-keys [data-key="D"]');
  const slots = await page.locator("#cache-slots li").allTextContents();
  await page.click("#tree-bars button:nth-child(2)");
  const sum = await text("#tree-sum");
  await page.click("#graph-run");
  await page.waitForTimeout(2500);
  const log = await text("#graph-log");
  console.log("collections", width, { slots: slots.join(), sum, log: log.slice(0, 80), errors }, await page.evaluate(() => document.documentElement.scrollWidth));
  await page.screenshot({ path: join(out, `collections-${width}.png`), fullPage: true });
  await close();
}

// The sites with a phone table
for (const path of ["/ts-base/", "/layout-contract/"]) {
  const { page, errors, close } = await open(path, 360);
  console.log(path, JSON.stringify(await shape(page)), errors);
  await page.screenshot({ path: join(out, `${path.replaceAll("/", "")}-360.png`), fullPage: true });
  await close();
}

// The port result of grafana-infra stays in view at the end of the long column of fields.
{
  const { page, errors, close } = await open("/grafana-infra/", 1280);
  await page.evaluate(() => {
    const fields = document.querySelector(".fields").getBoundingClientRect();
    scrollTo(0, scrollY + fields.bottom - innerHeight - 40);
  });
  await page.waitForTimeout(400);
  const panel = await page.evaluate(() => {
    const rect = document.querySelector(".impact").getBoundingClientRect();
    return { top: Math.round(rect.top), bottom: Math.round(rect.bottom), view: innerHeight };
  });
  console.log("grafana port result", JSON.stringify(panel), errors);
  await page.screenshot({ path: join(out, "grafana-ports-1280.png") });
  await close();
}

// The highways table: the live page, the CSS of the branch and the labels from the head of the table
{
  const { page, errors, close } = await open("/highways/", 360);
  const before = await shape(page);
  await page.locator("#bench-table tbody tr").first().waitFor({ timeout: 15000 });
  await page.addStyleTag({ content: readFileSync(join(here, "highways-style.css"), "utf8") });
  await page.evaluate(() => {
    const heads = [...document.querySelectorAll("#bench-table thead th")].map((cell) => cell.textContent.trim());
    for (const row of document.querySelectorAll("#bench-table tbody tr")) {
      [...row.children].forEach((cell, index) => {
        if (cell.tagName === "TD") cell.dataset.label = heads[index];
      });
    }
  });
  await page.waitForTimeout(300);
  console.log("highways before", JSON.stringify(before.tables), "after", JSON.stringify((await shape(page)).tables), errors);
  await page.locator("#bench-table").screenshot({ path: join(out, "highways-table-360.png") });
  await close();
}

// The sites that took the shared shell: the build line, the width and the errors
for (const path of []) {
  for (const width of [360, 1280]) {
    const { page, errors, close } = await open(path, width);
    const { pageWide, view, build } = await shape(page);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? document.documentElement.className);
    console.log("shell", path, width, JSON.stringify({ pageWide, view, build, theme }), errors);
    await close();
  }
}

// The live main site: each view at each width, and each poster
for (const route of ["", "#board", "#river"]) {
  for (const width of [360, 1280]) {
    const { page, errors, close } = await open(`/${route}`, width);
    await page.waitForTimeout(3500);
    const state = await page.evaluate(() => ({
      pageWide: document.documentElement.scrollWidth,
      view: innerWidth,
      frames: document.querySelectorAll("iframe").length,
      cards: document.querySelectorAll("a[data-id]").length,
      images: document.querySelectorAll(".frame-poster img").length,
      loaded: [...document.querySelectorAll(".frame-poster img")].filter((image) => image.complete && image.naturalWidth > 0).length,
    }));
    console.log("main", route || "#pond", width, JSON.stringify(state), errors);
    await page.screenshot({ path: join(out, `main-${(route || "#pond").slice(1)}-${width}.png`) });
    await close();
  }
}
{
  const { page, close } = await open("/", 1280);
  const sources = await page.evaluate(() => [...new Set([...document.querySelectorAll(".frame-poster img")].map((image) => image.src))]);
  const cell = { width: 320, height: 200 };
  const tiles = [];
  for (const [index, source] of sources.entries()) {
    const response = await fetch(source);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!response.ok) {
      console.log("poster failed", source, response.status);
      continue;
    }
    const picture = sharp(bytes);
    const { channels } = await picture.stats();
    const spread = Math.max(...channels.slice(0, 3).map((channel) => channel.stdev));
    console.log("poster", source.split("/").at(-1), bytes.length, `spread ${spread.toFixed(1)}`, spread < 8 ? "BLANK?" : "");
    const input = await sharp(bytes).resize(cell.width, cell.height, { fit: "contain", background: "#808080" }).png().toBuffer();
    tiles.push({ input, left: (index % 6) * (cell.width + 4), top: Math.floor(index / 6) * (cell.height + 4) });
  }
  const rows = Math.ceil(sources.length / 6);
  await sharp({ create: { width: 6 * (cell.width + 4), height: rows * (cell.height + 4), channels: 3, background: "#000000" } })
    .composite(tiles)
    .png()
    .toFile(join(out, "main-posters.png"));
  console.log("posters", sources.length);
  await close();
}

await browser.close();
