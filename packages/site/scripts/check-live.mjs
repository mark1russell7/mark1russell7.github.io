// This script proves the rule of the live frames in a browser: at most one live frame, and leaving a card unloads it.
// The workflow Measure lag starts it against the built site. It writes pictures of each state to LAG_OUT/shots.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";

const BASE = process.env.LAG_BASE.replace(/\/$/, "");
const OUT = join(process.env.LAG_OUT, "shots");
mkdirSync(OUT, { recursive: true });

const failures = [];
function check(name, ok, detail) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
  if (!ok) failures.push(name);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const frames = (page) => page.locator("iframe").count();
const cards = (page) => page.locator("a[data-id]");

/** This function gives the center of a card in the view, or null when no card is in the view. */
async function centerOf(page, index) {
  const box = await cards(page).nth(index).boundingBox();
  return box && { x: box.x + box.width / 2, y: box.y + box.height / 3 };
}

const browser = await chromium.launch();

// A phone: no hover, and a tap opens the panel
{
  const context = await browser.newContext({ viewport: { width: 360, height: 780 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await sleep(4000);
  check("a phone loads no live frame", (await frames(page)) === 0, await frames(page));
  const pictures = await page.locator(".frame-poster img").evaluateAll((list) =>
    list.map((image) => ({ done: image.complete && image.naturalWidth > 0, wide: image.getAttribute("width") })),
  );
  check("each poster has its width in the document", pictures.length > 0 && pictures.every((one) => one.wide === "640"), pictures.length);
  check("the posters in the view have loaded", pictures.some((one) => one.done), pictures.filter((one) => one.done).length);
  await page.screenshot({ path: join(OUT, "pond-360-posters.png") });
  await cards(page).first().tap();
  await sleep(1500);
  check("a tap opens the panel with one frame", (await frames(page)) === 1 && (await page.locator(".expanded iframe").count()) === 1, await frames(page));
  await page.screenshot({ path: join(OUT, "pond-360-open.png") });
  await page.getByRole("button", { name: "Close" }).tap();
  await sleep(1200);
  check("closing the panel unloads its frame", (await frames(page)) === 0, await frames(page));
  await context.close();
}

// A desktop: hover, keyboard and click
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "load" });
  await sleep(4000);
  check("a desktop loads no live frame", (await frames(page)) === 0, await frames(page));
  await page.screenshot({ path: join(OUT, "pond-1280-posters.png") });

  const first = await centerOf(page, 0);
  await page.mouse.move(first.x, first.y);
  await sleep(100);
  check("a pointer that only crosses a card starts nothing", (await frames(page)) === 0, await frames(page));
  await page.mouse.move(first.x + 2, first.y + 2);
  await sleep(1800);
  check("a mouse that rests on a card starts one frame", (await frames(page)) === 1, await frames(page));
  await page.screenshot({ path: join(OUT, "pond-1280-hover.png") });
  // A series tells a mark that stays from a mark of one frame.
  for (const [index, wait] of [300, 700, 1000, 2000, 4000].entries()) {
    await sleep(wait);
    await page.screenshot({ path: join(OUT, `pond-1280-hover-${index}.png`) });
    const boxes = await page.evaluate(() => {
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height].map(Math.round).join(",");
      };
      return [...document.querySelectorAll("iframe")].map((frame) => ({
        frame: box(frame),
        opacity: getComputedStyle(frame).opacity,
        parent: box(frame.parentElement),
      }));
    });
    console.log(`hover shot ${index}: ${JSON.stringify(boxes)}`);
  }

  let most = 0;
  const watch = setInterval(() => {
    frames(page).then((count) => {
      most = Math.max(most, count);
    }, () => {});
  }, 50);
  for (const index of [1, 2, 3, 4]) {
    const next = await centerOf(page, index);
    if (next) await page.mouse.move(next.x, next.y);
    await sleep(700);
  }
  clearInterval(watch);
  check("a move from card to card never holds two frames", most <= 1, most);

  await page.mouse.move(640, 12);
  await sleep(700);
  check("leaving a card unloads its frame", (await frames(page)) === 0, await frames(page));

  await page.keyboard.press("Tab");
  for (let press = 0; press < 12; press++) {
    if (await page.evaluate(() => document.activeElement?.hasAttribute("data-id"))) break;
    await page.keyboard.press("Tab");
  }
  await sleep(1200);
  check("the keyboard starts one frame", (await frames(page)) === 1, await frames(page));
  await page.keyboard.press("Enter");
  await sleep(1500);
  check("opening a card keeps one frame, in the panel", (await frames(page)) === 1 && (await page.locator(".expanded iframe").count()) === 1, await frames(page));
  await page.screenshot({ path: join(OUT, "pond-1280-open.png") });
  await page.keyboard.press("Escape");
  await sleep(1200);
  check("the frame count after a close is at most one", (await frames(page)) <= 1, await frames(page));
  await context.close();
}

await browser.close();
console.log(failures.length ? `FAILED: ${failures.join("; ")}` : "all checks passed");
process.exitCode = failures.length ? 1 : 0;
