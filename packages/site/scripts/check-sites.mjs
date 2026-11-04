// Checks the deployed sites at 360 and 1280, and previews the highways table with the CSS of its branch.
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

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
for (const path of ["/lag-hud/", "/docker-sqlite/", "/cue/", "/layout-contract/"]) {
  const { page, errors, close } = await open(path, 360);
  console.log(path, JSON.stringify(await shape(page)), errors);
  await page.screenshot({ path: join(out, `${path.replaceAll("/", "")}-360.png`), fullPage: true });
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
for (const path of ["/ts-base/", "/grafana-infra/", "/otel-ts/", "/Funk/", "/highways/", "/layout-contract/", "/optional/"]) {
  for (const width of [360, 1280]) {
    const { page, errors, close } = await open(path, width);
    const { pageWide, view, build } = await shape(page);
    const theme = await page.evaluate(() => document.documentElement.dataset.theme ?? document.documentElement.className);
    console.log("shell", path, width, JSON.stringify({ pageWide, view, build, theme }), errors);
    await close();
  }
}

await browser.close();
