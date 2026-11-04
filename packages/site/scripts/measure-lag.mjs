// This script measures the lag of the site in a headless Chromium. It runs in CI only, because load on a shared computer makes the numbers wrong.
// The workflow measure-lag.yml starts it. Each sample uses a new browser. The order of the cases turns in each round.
//
// Modes (LAG_MODES, separated by commas):
//   census    counts rAF loops, timers, frames, layers and nodes. It wraps browser functions, so it never shares a page with a timing sample.
//   grid      the three routes at each condition: load, 15 s of idle time, and a scroll.
//   causes    removes one suspect in each arm, and compares it with the same case. The arm "aa" repeats the base, so it shows the noise.
//   probe     a CDP Profiler capture and a trace of each route.
//   summarize writes summary.json and summary.md from the records.

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { cpus, loadavg } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { median, quantile } from "@mark1russell7/rigor-statistics";
import { chromium } from "playwright";

const env = process.env;
const BASE = (env.LAG_BASE ?? "https://mark1russell7.github.io").replace(/\/$/, "");
const TARGET = env.LAG_TARGET ?? "live";
const MODES = (env.LAG_MODES ?? "census,grid").split(",");
const OUT = env.LAG_OUT ?? "lag-records";
const SHARD = env.LAG_SHARD ?? TARGET;
const REPEATS = Number(env.LAG_REPEATS ?? 5);
const IDLE_MS = Number(env.LAG_IDLE_MS ?? 15000);
const SETTLE_MS = Number(env.LAG_SETTLE_MS ?? 5000);
const WIDTHS = (env.LAG_WIDTHS ?? "360,1280").split(",").map(Number);
const SCROLL_PX_S = 1000;
const SCROLL_MAX_S = 15;
const WHEEL_PX = 4000;
const GOTO_LIMIT_MS = 90000;
/** One sample stops at this limit. It closes its browser and writes a record with the stage that it reached. */
const SAMPLE_LIMIT_MS = Number(env.LAG_SAMPLE_LIMIT_MS ?? 180000);
const CENSUS_LIMIT_MS = 240000;
const PROBE_LIMIT_MS = 420000;
/** One read of one frame stops at this limit. A frame that does not answer never blocks the sample. A page at CPU rate 4 needs more than 5 s. */
const FRAME_READ_LIMIT_MS = 20000;
const CENSUS_READ_LIMIT_MS = 20000;
/** The script stops new work after this time, so the summary and the upload always run. */
const BUDGET_MS = Number(env.LAG_BUDGET_MIN ?? 70) * 60000;
const STARTED = Date.now();
const overBudget = () => Date.now() - STARTED > BUDGET_MS;

const CONDITIONS = [
  { width: 360, height: 780, rate: 1 },
  { width: 360, height: 780, rate: 4 },
  { width: 1280, height: 800, rate: 1 },
].filter((c) => WIDTHS.includes(c.width));
const ROUTES = ["pond", "river", "board"];
const ARGS = ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"];
const TRACE_CATEGORIES = ["toplevel", "devtools.timeline", "disabled-by-default-devtools.timeline", "gpu", "viz", "v8"];

mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const round = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)) : null);
/** The arm "before" loads the build of main from a second server in the same job, so its pair is fair. */
const BEFORE = (env.LAG_BEFORE_BASE ?? BASE).replace(/\/$/, "");
const urlOf = (route, arm) => {
  const base = arm === "before" ? BEFORE : BASE;
  return route === "pond" ? `${base}/` : `${base}/#${route}`;
};

process.on("unhandledRejection", (error) => console.log(`unhandled rejection: ${String(error).slice(0, 200)}`));

/** The stage of the current sample. The progress lines and the record of a stuck sample give it. */
let stage = { name: "start", at: Date.now(), first: Date.now(), list: [] };

function enter(name) {
  const at = Date.now();
  stage.list.push({ name: stage.name, ms: at - stage.at });
  console.log(`  +${Math.round((at - stage.first) / 1000)} s ${name}`);
  stage.name = name;
  stage.at = at;
}

function begin(label) {
  const at = Date.now();
  stage = { name: "start", at, first: at, list: [] };
  console.log(`[${Math.round((at - STARTED) / 1000)} s] ${label}`);
}

/** The browsers that are open. A case that passes its limit closes them here, because its own finally block never runs. */
const browsers = new Set();

async function closeBrowser(browser) {
  browsers.delete(browser);
  await Promise.race([browser.close().catch(() => {}), sleep(10000)]);
}

async function closeAll() {
  const open = [...browsers];
  await Promise.all(open.map(closeBrowser));
  // A browser that does not close keeps the CPU busy and keeps Node alive, so the next samples become wrong.
  if (open.length) spawnSync("pkill", ["-9", "-x", "chrome"]);
}

/** This function stops `work` at the limit. It closes the browsers, and the error names the stage. */
async function limited(label, ms, work) {
  let timer;
  const limit = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} passed its limit of ${ms} ms in the stage "${stage.name}"`)), ms);
  });
  try {
    return await Promise.race([work(), limit]);
  } catch (error) {
    console.log(`  STOPPED: ${String(error).slice(0, 200)}`);
    await closeAll();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** A frame with no URL has no document: for example a lazy iframe that the browser did not load. An evaluate in it never ends. */
const hasDocument = (frame) => !frame.isDetached() && frame.url() !== "" && frame.url() !== "about:blank";

/** This function reads a value from one frame. It gives null when the frame does not answer in time. */
function read(frame, fn, ms = FRAME_READ_LIMIT_MS) {
  return Promise.race([frame.evaluate(fn).catch(() => null), sleep(ms).then(() => null)]);
}

/** This script runs before each document of each frame. It uses only observers and one rAF loop, so LoAF attribution stays correct. */
const INIT = `(() => {
  if (window.__lag) return;
  const origin = performance.timeOrigin;
  const root = (window.__lag = { origin, path: location.pathname, top: window.top === window, frames: [], longtasks: [], loaf: [], lcp: [], cls: [], paint: [], unsupported: [] });
  const on = (type, handle, options) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(handle)).observe({ type, buffered: true, ...options });
    } catch (error) {
      root.unsupported.push(type);
    }
  };
  on("longtask", (e) => root.longtasks.push({ at: origin + e.startTime, dur: e.duration, name: e.name, attribution: (e.attribution || []).map((a) => ({ name: a.name, type: a.containerType, src: a.containerSrc })) }));
  on("long-animation-frame", (e) => {
    const end = e.startTime + e.duration;
    root.loaf.push({
      at: origin + e.startTime,
      dur: e.duration,
      blocking: e.blockingDuration,
      render: e.renderStart ? end - e.renderStart : 0,
      styleLayout: e.styleAndLayoutStart ? end - e.styleAndLayoutStart : 0,
      scripts: (e.scripts || []).map((s) => ({ dur: s.duration, forced: s.forcedStyleAndLayoutDuration, invoker: s.invoker, type: s.invokerType, url: s.sourceURL, fn: s.sourceFunctionName, pos: s.sourceCharPosition, window: s.windowAttribution })),
    });
  });
  on("largest-contentful-paint", (e) => root.lcp.push({ at: e.startTime, load: e.loadTime, render: e.renderTime, size: e.size, url: e.url, tag: e.element && e.element.tagName }));
  on("resource", (e) => {
    if (!root.top) return;
    (root.resources ??= []).push({ name: e.name, type: e.initiatorType, start: e.startTime, request: e.requestStart, response: e.responseStart, end: e.responseEnd });
  });
  on("layout-shift", (e) => root.cls.push({ at: e.startTime, value: e.value, input: e.hadRecentInput }));
  on("paint", (e) => root.paint.push({ name: e.name, at: e.startTime }));
  if (root.top) {
    // This script runs before the census script. The census does not wrap this function, so it does not count this loop.
    const raf = window.requestAnimationFrame;
    const tick = (t) => {
      root.frames.push(origin + t);
      raf.call(window, tick);
    };
    raf.call(window, tick);
  }
})();`;

/** This script counts rAF callbacks and timers in each frame. Only the census uses it. */
const CENSUS_INIT = `(() => {
  if (window.__census) return;
  const c = (window.__census = { raf: 0, timeouts: 0, intervalFires: 0, intervals: new Map(), workers: 0, contexts: [], since: performance.now() });
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (callback) {
    return raf.call(window, (t) => {
      c.raf++;
      callback(t);
    });
  };
  const setI = window.setInterval;
  const clearI = window.clearInterval;
  const setT = window.setTimeout;
  window.setInterval = function (callback, ms, ...rest) {
    const id = setI.call(window, (...values) => {
      c.intervalFires++;
      if (typeof callback === "function") callback(...values);
    }, ms, ...rest);
    c.intervals.set(id, ms);
    return id;
  };
  window.clearInterval = function (id) {
    c.intervals.delete(id);
    return clearI.call(window, id);
  };
  window.setTimeout = function (callback, ms, ...rest) {
    return setT.call(window, (...values) => {
      c.timeouts++;
      if (typeof callback === "function") callback(...values);
    }, ms, ...rest);
  };
  const W = window.Worker;
  window.Worker = function (...values) {
    c.workers++;
    return new W(...values);
  };
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const context = get.call(this, type, ...rest);
    if (context && !this.__type) {
      this.__type = type;
      c.contexts.push(type);
    }
    return context;
  };
})();`;

const ARM_INIT = {
  nowebgl: `(() => {
    if (window.top !== window) return;
    const get = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
      return /webgl/.test(String(type)) ? null : get.call(this, type, ...rest);
    };
  })();`,
  eager: `(() => {
    if (window.top !== window) return;
    const first = "img[loading=lazy][src$='/systems.webp'], img[loading=lazy][src$='/client.webp']";
    new MutationObserver(() => {
      for (const image of document.querySelectorAll(first)) {
        image.fetchPriority = "high";
        image.decoding = "sync";
        image.loading = "eager";
      }
    }).observe(document, { childList: true, subtree: true });
  })();`,
  nobackdrop: `(() => {
    if (window.top !== window) return;
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.textContent = ".card-tile { backdrop-filter: none !important; }";
      document.head.appendChild(style);
    });
  })();`,
};

/** This function gives a fixed amount of work and its time, so a slow runner shows in the records. */
function calibrate() {
  const passes = [];
  let x = 0;
  for (let pass = 0; pass < 5; pass++) {
    const start = performance.now();
    for (let i = 0; i < 3e7; i++) x = (x * 31 + i) | 0;
    passes.push(performance.now() - start);
  }
  return { ms: round(median(passes)), x };
}

async function open(c, { arm = "base", census = false } = {}) {
  const browser = await chromium.launch({ channel: "chromium", headless: true, args: ARGS });
  browsers.add(browser);
  const context = await browser.newContext({
    viewport: { width: c.width, height: c.height },
    deviceScaleFactor: 1,
    reducedMotion: arm === "reduced" ? "reduce" : "no-preference",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 200)));
  await page.addInitScript({ content: INIT });
  if (census) await page.addInitScript({ content: CENSUS_INIT });
  if (ARM_INIT[arm]) await page.addInitScript({ content: ARM_INIT[arm] });
  if (arm === "nohead") {
    // GitHub Pages speaks HTTP/2, so its HEAD requests hold no connection. This arm takes that queue away from the preview server.
    await page.route("**/*", (route) => (route.request().method() === "HEAD" ? route.fulfill({ status: 200 }) : route.continue()));
  }
  if (arm === "nopreload") {
    await page.route((url) => url.pathname === "/", async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace(/<link rel="preload" as="image"[^>]*>/g, "");
      await route.fulfill({ response, body });
    });
  }
  if (arm === "noiframes") {
    await page.route("**/*", (route) => {
      const request = route.request();
      if (request.isNavigationRequest() && request.frame() !== page.mainFrame()) {
        return route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>empty</title>" });
      }
      return route.continue();
    });
  }
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("Network.enable");
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: c.rate });
  const requests = new Map();
  cdp.on("Network.requestWillBeSent", (e) => requests.set(e.requestId, { url: e.request.url, method: e.request.method, frame: e.frameId, type: e.type, encoded: 0, decoded: 0, at: Date.now() }));
  cdp.on("Network.responseReceived", (e) => {
    const r = requests.get(e.requestId);
    if (r) Object.assign(r, { type: e.type, status: e.response.status });
  });
  cdp.on("Network.dataReceived", (e) => {
    const r = requests.get(e.requestId);
    if (r) r.decoded += e.dataLength;
  });
  cdp.on("Network.loadingFinished", (e) => {
    const r = requests.get(e.requestId);
    if (r) r.encoded = e.encodedDataLength;
  });
  return { browser, context, page, cdp, requests, errors };
}

async function metrics(cdp) {
  const { metrics: list } = await cdp.send("Performance.getMetrics");
  return Object.fromEntries(list.map((m) => [m.name, m.value]));
}

/** This function reads the records of each frame in parallel. The array also tells how many frames had no document or gave no answer. */
async function collect(page) {
  const frames = page.frames();
  const ready = frames.filter(hasDocument);
  const answers = await Promise.all(ready.map((frame) => read(frame, () => (window.__lag ? { ...window.__lag, nav: performance.getEntriesByType("navigation")[0]?.toJSON() } : null))));
  const parts = answers.filter(Boolean);
  parts.frameCount = { all: frames.length, noDocument: frames.length - ready.length, noAnswer: ready.length - parts.length };
  console.log(`    frames: ${JSON.stringify(parts.frameCount)}`);
  return parts;
}

/** A long task or a LoAF can show in more than one frame. This function keeps one copy. */
function unique(entries) {
  const seen = new Set();
  return entries.filter((e) => {
    const key = `${Math.round(e.at)}|${Math.round(e.dur)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function site(url) {
  if (!url) return "(none)";
  try {
    const u = new URL(url);
    if (!url.startsWith(BASE)) return u.host;
    const first = u.pathname.split("/")[1] ?? "";
    return first === "" || first === "assets" ? "(portfolio)" : first;
  } catch {
    return "(other)";
  }
}

function attribute(loaf) {
  const map = new Map();
  let render = 0;
  let styleLayout = 0;
  for (const l of loaf) {
    render += l.render;
    styleLayout += l.styleLayout;
    for (const s of l.scripts) {
      const key = `${site(s.url)} | ${s.fn || "(anonymous)"} | ${s.type} | ${String(s.invoker).slice(0, 70)} | char ${s.pos}`;
      const entry = map.get(key) ?? { key, ms: 0, forcedMs: 0, count: 0 };
      entry.ms += s.dur;
      entry.forcedMs += s.forced ?? 0;
      entry.count += 1;
      map.set(key, entry);
    }
  }
  const scripts = [...map.values()].sort((a, b) => b.ms - a.ms).slice(0, 12).map((e) => ({ ...e, ms: round(e.ms), forcedMs: round(e.forcedMs) }));
  return { renderMs: round(render), styleLayoutMs: round(styleLayout), scripts };
}

function phase(parts, from, to, before, after) {
  const top = parts.find((p) => p.top);
  const times = (top?.frames ?? []).filter((t) => t >= from && t <= to);
  const deltas = [];
  for (let i = 1; i < times.length; i++) deltas.push(times[i] - times[i - 1]);
  const wall = to - from;
  const longtasks = unique(parts.flatMap((p) => p.longtasks)).filter((e) => e.at >= from && e.at <= to);
  const loaf = unique(parts.flatMap((p) => p.loaf)).filter((e) => e.at >= from && e.at <= to);
  const share = (name) => round((100 * (after[name] - before[name]) * 1000) / wall, 1);
  return {
    stats: {
      wallMs: wall,
      frames: times.length,
      fps: round((times.length / wall) * 1000, 1),
      p50: deltas.length ? round(quantile(deltas, 0.5)) : null,
      p95: deltas.length ? round(quantile(deltas, 0.95)) : null,
      p99: deltas.length ? round(quantile(deltas, 0.99)) : null,
      max: deltas.length ? round(Math.max(...deltas)) : null,
      over33: deltas.filter((d) => d > 33).length,
      over33Pct: deltas.length ? round((100 * deltas.filter((d) => d > 33).length) / deltas.length, 1) : null,
      longtasks: longtasks.length,
      longtaskMs: round(longtasks.reduce((a, e) => a + e.dur, 0)),
      loaf: loaf.length,
      loafMs: round(loaf.reduce((a, e) => a + e.dur, 0)),
      loafBlockingMs: round(loaf.reduce((a, e) => a + e.blocking, 0)),
      busyPct: share("TaskDuration"),
      scriptPct: share("ScriptDuration"),
      layoutPct: share("LayoutDuration"),
      stylePct: share("RecalcStyleDuration"),
      layouts: after.LayoutCount - before.LayoutCount,
      styles: after.RecalcStyleCount - before.RecalcStyleCount,
    },
    attribution: attribute(loaf),
    deltas: deltas.map((d) => round(d, 1)),
    longtaskSample: longtasks.slice(0, 200),
    loafSample: loaf.slice(0, 200),
  };
}

function loadRecord(parts, requests, loadAt, windowEnd, m) {
  const top = parts.find((p) => p.top);
  const longtasks = unique(parts.flatMap((p) => p.longtasks));
  const fcp = top?.paint.find((p) => p.name === "first-contentful-paint")?.at ?? null;
  const fcpAt = (top?.origin ?? loadAt) + (fcp ?? 0);
  const inWindow = longtasks.filter((e) => e.at >= fcpAt && e.at <= windowEnd);
  const lcp = top?.lcp.at(-1);
  const shifts = (top?.cls ?? []).filter((s) => !s.input);
  const isMain = (r) => r.frame === [...requests.values()][0]?.frame;
  const sum = (filter, key) => [...requests.values()].filter(filter).reduce((a, r) => a + r[key], 0);
  const kind = (r, type) => r.type === type;
  return {
    stats: {
      ttfb: round(top?.nav?.responseStart ?? NaN, 0),
      fcp: round(fcp ?? NaN, 0),
      lcp: round(lcp?.at ?? NaN, 0),
      lcpTag: lcp ? `${lcp.tag} ${String(lcp.url).slice(0, 60)}` : null,
      lcpLoad: round(lcp?.load ?? NaN, 0),
      lcpRender: round(lcp?.render ?? NaN, 0),
      lcpSeries: (top?.lcp ?? []).map((e) => `${Math.round(e.at)} ${e.tag} ${e.size}`).join("; "),
      posterTimes: (top?.resources ?? []).filter((e) => e.name.includes("/posters/")).slice(0, 3).map((e) => [e.name.split("/").at(-1), e.start, e.request, e.end].map((v) => (typeof v === "number" ? Math.round(v) : v)).join(" ")).join("; "),
      headLast: round(Math.max(0, ...(top?.resources ?? []).filter((e) => e.type === "fetch").map((e) => e.end)), 0),
      scriptEnd: round(Math.max(0, ...(top?.resources ?? []).filter((e) => e.type === "script").map((e) => e.end)), 0),
      loadEvent: round(top?.nav?.loadEventEnd ?? NaN, 0),
      cls: round(shifts.reduce((a, s) => a + s.value, 0), 4),
      tbt: round(inWindow.reduce((a, e) => a + Math.max(0, e.dur - 50), 0), 0),
      longtasks: inWindow.length,
      longest: round(Math.max(0, ...inWindow.map((e) => e.dur)), 0),
      jsEncodedMain: sum((r) => isMain(r) && kind(r, "Script"), "encoded"),
      jsDecodedMain: sum((r) => isMain(r) && kind(r, "Script"), "decoded"),
      cssEncodedMain: sum((r) => isMain(r) && kind(r, "Stylesheet"), "encoded"),
      jsEncodedFrames: sum((r) => !isMain(r) && kind(r, "Script"), "encoded"),
      jsDecodedFrames: sum((r) => !isMain(r) && kind(r, "Script"), "decoded"),
      cssEncodedFrames: sum((r) => !isMain(r) && kind(r, "Stylesheet"), "encoded"),
      documents: [...requests.values()].filter((r) => r.type === "Document").length,
      requests: requests.size,
      headRequests: [...requests.values()].filter((r) => r.method === "HEAD").length,
      posterRequests: [...requests.values()].filter((r) => r.url.includes("/posters/")).length,
      posterBytes: sum((r) => r.url.includes("/posters/"), "encoded"),
      nodes: m.Nodes,
      frames: m.Frames,
      documentsLive: m.Documents,
      layoutObjects: m.LayoutObjects,
      heapMb: round((m.JSHeapUsedSize ?? 0) / 1048576, 1),
    },
  };
}

async function scrollDown(page, cdp, width, height) {
  const before = await page.evaluate(() => {
    const s = document.querySelector(".pond-scroll.scrolls");
    return s ? { max: s.scrollHeight - s.clientHeight } : null;
  });
  const native = before !== null && before.max > 0;
  const distance = native ? before.max : WHEEL_PX;
  const speed = Math.max(SCROLL_PX_S, Math.ceil(distance / SCROLL_MAX_S));
  const expected = (distance / speed) * 1000;
  let note = null;
  await Promise.race([
    cdp
      .send("Input.synthesizeScrollGesture", { x: Math.round(width / 2), y: Math.round(height / 2), yDistance: -distance, speed, gestureSourceType: "mouse", preventFling: true })
      .catch((error) => {
        note = String(error).slice(0, 160);
      }),
    sleep(expected * 3 + 20000).then(() => {
      note = "The gesture did not end in time.";
    }),
  ]);
  const position = () => page.evaluate(() => document.querySelector(".pond-scroll.scrolls")?.scrollTop ?? 0);
  let reached = native ? await position() : 0;
  let method = native ? "wheel gesture" : "wheel gesture, no native scroller";
  if (native && reached < 0.9 * distance) {
    method = "rAF scrollBy, the gesture stopped early";
    await page.evaluate(
      ({ speed: pxPerSecond, limit }) =>
        new Promise((resolve) => {
          const s = document.querySelector(".pond-scroll.scrolls");
          const start = performance.now();
          let last = start;
          const step = (t) => {
            s.scrollTop += (pxPerSecond * (t - last)) / 1000;
            last = t;
            if (s.scrollTop + s.clientHeight >= s.scrollHeight - 1 || t - start > limit) resolve();
            else requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
      { speed, limit: expected * 2 },
    );
    reached = await position();
  }
  return { method, distance, speed, reached: round(reached, 0), note };
}

/** This function reads the frame meter of the site from its tile. The meter counts only the simulation step of the site. */
async function siteMeter(page) {
  return page.evaluate(() => {
    const text = document.querySelector("canvas.meter")?.parentElement?.textContent ?? "";
    const match = /uses ([\d.]+) ms of each frame, at (\d+) frames/.exec(text);
    return match ? { workMs: Number(match[1]), fps: Number(match[2]) } : null;
  });
}

/** This function fills `record` as it goes, so a sample that stops still leaves the stages that ended. */
async function sample(c, record) {
  const { arm } = c;
  enter("launch");
  const session = await open(c, { arm });
  const { browser, page, cdp, requests, errors } = session;
  try {
    enter("goto");
    await page.goto(urlOf(c.route, arm), { waitUntil: "load", timeout: GOTO_LIMIT_MS });
    const loadAt = Date.now();
    enter("settle");
    await sleep(SETTLE_MS);
    const windowEnd = Date.now();
    enter("read load");
    const atSettle = await metrics(cdp);
    const parts0 = await collect(page);
    record.frameCount = parts0.frameCount;
    record.load = loadRecord(parts0, requests, loadAt, windowEnd, atSettle);

    enter("idle");
    const idleBefore = await metrics(cdp);
    const idleStart = Date.now();
    await sleep(IDLE_MS);
    const idleEnd = Date.now();
    const idleAfter = await metrics(cdp);
    const meter = await siteMeter(page).catch(() => null);

    enter("scroll");
    const scrollBefore = await metrics(cdp);
    const scrollStart = Date.now();
    const scroll = await scrollDown(page, cdp, c.width, c.height);
    const scrollEnd = Date.now();
    const scrollAfter = await metrics(cdp);
    enter("read end");
    const parts = await collect(page);
    record.frameCountEnd = parts.frameCount;
    const afterLoad = loadRecord(parts, requests, loadAt, windowEnd, scrollAfter);
    Object.assign(record, {
      afterScroll: afterLoad.stats,
      idle: { ...phase(parts, idleStart, idleEnd, idleBefore, idleAfter), meter },
      scroll: { ...phase(parts, scrollStart, scrollEnd, scrollBefore, scrollAfter), gesture: scroll },
      errors,
      unsupported: [...new Set(parts.flatMap((p) => p.unsupported))],
    });
  } finally {
    enter("close");
    await closeBrowser(browser);
  }
}

function caseName(c) {
  return `${c.route}|${c.width}|x${c.rate}|${c.arm ?? "base"}`;
}

async function runRounds(cases, file) {
  const path = join(OUT, file);
  const count = cases.length * REPEATS;
  let done = 0;
  for (let r = 0; r < REPEATS; r++) {
    const shift = cases.length ? (r * 7) % cases.length : 0;
    const order = [...cases.slice(shift), ...cases.slice(0, shift)];
    for (const c of order) {
      if (overBudget()) {
        console.log(`The budget ended after ${done} of ${count} samples.`);
        return;
      }
      done += 1;
      begin(`sample ${done}/${count} ${caseName(c)} round ${r}`);
      const record = { target: TARGET, shard: SHARD, case: caseName(c), ...c, round: r, calibrateMs: calibrate().ms, load1: loadavg()[0], startedAt: new Date().toISOString() };
      const started = Date.now();
      try {
        await limited(caseName(c), SAMPLE_LIMIT_MS, () => sample(c, record));
      } catch (error) {
        record.error = String(error).slice(0, 400);
        record.stoppedIn = stage.name;
      }
      record.stages = stage.list;
      appendFileSync(path, `${JSON.stringify(record)}\n`);
      console.log(`${record.case} round ${r}: ${Math.round((Date.now() - started) / 1000)} s ${record.error ?? "ok"}`);
    }
  }
}

function gridCases() {
  const out = [];
  for (const route of ROUTES) for (const condition of CONDITIONS) out.push({ route, arm: "base", ...condition });
  return out;
}

function causeCases() {
  const out = [];
  for (const condition of CONDITIONS.filter((c) => c.rate === (c.width === 360 ? 4 : 1))) {
    for (const arm of ["base", "aa", "before", "reduced"]) out.push({ route: "pond", arm, ...condition });
  }
  return out;
}

async function censusFrames(page) {
  const frames = page.frames();
  const ready = frames.filter(hasDocument);
  const entries = await Promise.all(
    ready.map((frame) =>
      read(
        frame,
        () => {
        const c = window.__census;
        const seconds = c ? (performance.now() - c.since) / 1000 : 1;
        const all = [...document.querySelectorAll("*")];
        let willChange = 0;
        let backdrop = 0;
        let filter = 0;
        for (const element of all) {
          const style = getComputedStyle(element);
          if (style.willChange !== "auto") willChange++;
          if (style.backdropFilter !== "none") backdrop++;
          if (style.filter !== "none") filter++;
        }
        const animations = document.getAnimations().filter((a) => a.playState === "running");
        return {
          path: location.pathname + location.search,
          nodes: all.length,
          rafPerS: c ? Math.round((c.raf / seconds) * 10) / 10 : null,
          timeoutsPerS: c ? Math.round((c.timeouts / seconds) * 10) / 10 : null,
          intervalFiresPerS: c ? Math.round((c.intervalFires / seconds) * 10) / 10 : null,
          intervalsActive: c ? [...c.intervals.values()] : [],
          workers: c?.workers ?? 0,
          contexts: c?.contexts ?? [],
          canvases: [...document.querySelectorAll("canvas")].map((v) => ({ w: v.width, h: v.height, cssW: v.clientWidth, cssH: v.clientHeight, cls: v.className, type: v.__type ?? null })),
          svgs: document.querySelectorAll("svg").length,
          svgNodes: document.querySelectorAll("svg *").length,
          iframes: document.querySelectorAll("iframe").length,
          cards: { all: document.querySelectorAll(".card").length, site: document.querySelectorAll(".card-site").length, tile: document.querySelectorAll(".card-tile").length, pebble: document.querySelectorAll(".card-pebble").length },
          willChange,
          backdrop,
          filter,
          animationsRunning: animations.length,
          animationsInfinite: animations.filter((a) => a.effect?.getTiming?.().iterations === Infinity).length,
        };
        },
        CENSUS_READ_LIMIT_MS,
      ),
    ),
  );
  const out = entries.filter(Boolean);
  out.frameCount = { all: frames.length, noDocument: frames.length - ready.length, noAnswer: ready.length - out.length };
  console.log(`    frames: ${JSON.stringify(out.frameCount)}`);
  return out;
}

function censusSummary(frames) {
  const live = frames.filter((f) => !f.path.startsWith("about:") && f.path !== "blank");
  return {
    frames: frames.frameCount,
    documentsLoaded: live.length,
    nodesAll: live.reduce((a, f) => a + f.nodes, 0),
    rafPerSAll: round(live.reduce((a, f) => a + (f.rafPerS ?? 0), 0), 1),
    framesWithRaf: live.filter((f) => (f.rafPerS ?? 0) > 1).map((f) => ({ path: f.path, rafPerS: f.rafPerS })),
    timeoutsPerSAll: round(live.reduce((a, f) => a + (f.timeoutsPerS ?? 0), 0), 1),
    intervalsActiveAll: live.reduce((a, f) => a + f.intervalsActive.length, 0),
    workers: live.reduce((a, f) => a + f.workers, 0),
    webglContexts: live.reduce((a, f) => a + f.contexts.filter((t) => /webgl/.test(t)).length, 0),
    canvases: live.reduce((a, f) => a + f.canvases.length, 0),
    animationsRunning: live.reduce((a, f) => a + f.animationsRunning, 0),
    animationsInfinite: live.reduce((a, f) => a + f.animationsInfinite, 0),
    willChange: live.reduce((a, f) => a + f.willChange, 0),
    backdrop: live.reduce((a, f) => a + f.backdrop, 0),
    filter: live.reduce((a, f) => a + f.filter, 0),
  };
}

async function runCensus() {
  const records = [];
  for (const route of ROUTES) {
    for (const condition of CONDITIONS.filter((c) => c.rate === 1)) {
      if (overBudget()) {
        console.log("The budget ended in the census.");
        return;
      }
      const c = { route, ...condition };
      const record = { target: TARGET, ...c };
      begin(`census ${route} ${c.width}`);
      const work = async () => {
        enter("launch");
        const session = await open(c, { census: true });
        const { browser, page, cdp, requests } = session;
        try {
        let layers = [];
        let layerEvents = 0;
        cdp.on("LayerTree.layerTreeDidChange", (e) => {
          layerEvents++;
          if (e.layers) layers = e.layers;
        });
        enter("goto");
        await page.goto(urlOf(route), { waitUntil: "load", timeout: GOTO_LIMIT_MS });
        enter("settle");
        await sleep(SETTLE_MS);
        const reset = () =>
          Promise.all(
            page
              .frames()
              .filter(hasDocument)
              .map((f) =>
                read(f, () => {
                  if (window.__census) Object.assign(window.__census, { raf: 0, timeouts: 0, intervalFires: 0, since: performance.now() });
                }),
              ),
          );
        const window5 = async () => {
          await reset();
          await sleep(5000);
          const frames = await censusFrames(page);
          // The layer agent is on only for this read, so it does not change the counts of the window. Zero events means that the layers were not measured.
          await cdp.send("LayerTree.enable");
          await sleep(3000);
          await cdp.send("LayerTree.disable");
          return { summary: censusSummary(frames), frames, layerEvents, layers: layers.length, layersDrawing: layers.filter((l) => l.drawsContent).length, layerMemoryMb: round(layers.reduce((a, l) => a + l.width * l.height * 4, 0) / 1048576, 1), m: await metrics(cdp) };
        };
        enter("count after load");
        record.afterLoad = await window5();
        enter("screenshot after load");
        await page.screenshot({ path: join(OUT, `shot-${route}-${c.width}-load.png`), timeout: 30000 }).catch((error) => console.log(`    no screenshot: ${String(error).slice(0, 120)}`));
        enter("scroll");
        record.scroll = await scrollDown(page, cdp, c.width, c.height);
        await sleep(SETTLE_MS);
        enter("count after scroll");
        record.afterScroll = await window5();
        enter("screenshot after scroll");
        await page.screenshot({ path: join(OUT, `shot-${route}-${c.width}-scrolled.png`), timeout: 30000 }).catch((error) => console.log(`    no screenshot: ${String(error).slice(0, 120)}`));
        enter("renderer");
        record.gl = await page.evaluate(() => {
          const gl = document.createElement("canvas").getContext("webgl");
          const info = gl?.getExtension("WEBGL_debug_renderer_info");
          return gl ? { vendor: gl.getParameter(info?.UNMASKED_VENDOR_WEBGL ?? gl.VENDOR), renderer: gl.getParameter(info?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) } : null;
        });
        record.requests = [...requests.values()].filter((r) => r.type === "Document" || r.method === "HEAD").map((r) => `${r.method} ${r.status} ${r.url}`.slice(0, 120));
        } finally {
          enter("close");
          await closeBrowser(browser);
        }
      };
      try {
        await limited(`census ${route} ${c.width}`, CENSUS_LIMIT_MS, work);
      } catch (error) {
        record.error = String(error).slice(0, 400);
        record.stoppedIn = stage.name;
      }
      records.push(record);
      writeFileSync(join(OUT, `census-${SHARD}.json`), JSON.stringify(records, null, 1));
      console.log(`census ${route} ${c.width}: ${record.error ?? "ok"}`);
    }
  }
}

const mapCache = new Map();

async function sourceMap(url) {
  if (!url.startsWith(BASE) || !url.endsWith(".js")) return null;
  if (!mapCache.has(url)) {
    let map = null;
    try {
      const response = await fetch(`${url}.map`);
      if (response.ok) map = new TraceMap(await response.text());
    } catch {
      map = null;
    }
    mapCache.set(url, map);
  }
  return mapCache.get(url);
}

/** This function gives the self time and the total time of each function of a CDP profile, with the source position when a map exists. */
async function summarizeProfile(profile) {
  const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  for (let i = 0; i < profile.samples.length; i++) self.set(profile.samples[i], (self.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0));
  const keyOf = (n) => `${n.callFrame.functionName || "(anonymous)"}\u0000${n.callFrame.url}\u0000${n.callFrame.lineNumber}\u0000${n.callFrame.columnNumber}`;
  const table = new Map();
  const entry = (n) => {
    const key = keyOf(n);
    if (!table.has(key)) table.set(key, { fn: n.callFrame.functionName || "(anonymous)", url: n.callFrame.url, line: n.callFrame.lineNumber, column: n.callFrame.columnNumber, self: 0, total: 0 });
    return table.get(key);
  };
  const total = (n, active) => {
    const key = keyOf(n);
    const fresh = !active.has(key);
    if (fresh) active.add(key);
    let sum = self.get(n.id) ?? 0;
    for (const id of n.children ?? []) sum += total(nodes.get(id), active);
    const e = entry(n);
    e.self += self.get(n.id) ?? 0;
    if (fresh) {
      e.total += sum;
      active.delete(key);
    }
    return sum;
  };
  const root = profile.nodes[0];
  total(root, new Set());
  const wall = profile.timeDeltas.reduce((a, b) => a + b, 0);
  const special = new Set(["(root)", "(idle)", "(program)", "(garbage collector)"]);
  const rows = [...table.values()];
  const bySite = new Map();
  for (const r of rows) {
    const name = special.has(r.fn) ? r.fn : site(r.url);
    bySite.set(name, (bySite.get(name) ?? 0) + r.self);
  }
  const top = rows.filter((r) => r.fn !== "(root)").sort((a, b) => b.self - a.self).slice(0, 40);
  const topTotal = rows.filter((r) => !special.has(r.fn)).sort((a, b) => b.total - a.total).slice(0, 25);
  const describe = async (r) => {
    const out = { fn: r.fn, site: special.has(r.fn) ? "" : site(r.url), selfMs: round(r.self / 1000, 1), selfPct: round((100 * r.self) / wall, 1), totalMs: round(r.total / 1000, 1), totalPct: round((100 * r.total) / wall, 1), at: `${r.url}:${r.line + 1}:${r.column}` };
    const map = await sourceMap(r.url);
    if (map) {
      const position = originalPositionFor(map, { line: r.line + 1, column: r.column });
      if (position.source) out.source = `${position.source}:${position.line}`;
      if (position.name) out.sourceName = position.name;
    }
    return out;
  };
  return {
    wallMs: round(wall / 1000, 0),
    bySite: [...bySite.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([name, us]) => ({ name, ms: round(us / 1000, 1), pct: round((100 * us) / wall, 1) })),
    topSelf: await Promise.all(top.map(describe)),
    topTotal: await Promise.all(topTotal.map(describe)),
  };
}

/** This function gives the self time of each trace event on each thread. */
function analyzeTrace(buffer) {
  const { traceEvents } = JSON.parse(buffer.toString("utf8"));
  const threadNames = new Map();
  const processNames = new Map();
  for (const e of traceEvents) {
    if (e.ph !== "M") continue;
    if (e.name === "thread_name") threadNames.set(`${e.pid}:${e.tid}`, e.args.name);
    if (e.name === "process_name") processNames.set(e.pid, e.args.name);
  }
  const complete = traceEvents.filter((e) => e.ph === "X" && e.dur > 0).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const span = complete.length ? (complete.at(-1).ts - complete[0].ts) / 1000 : 0;
  const threads = new Map();
  for (const e of complete) {
    const key = `${e.pid}:${e.tid}`;
    if (!threads.has(key)) threads.set(key, { stack: [], self: new Map(), busy: 0, pid: e.pid, key });
    const t = threads.get(key);
    while (t.stack.length && t.stack.at(-1).end <= e.ts) t.stack.pop();
    const parent = t.stack.at(-1);
    const end = e.ts + e.dur;
    if (parent && end <= parent.end) t.self.set(parent.name, (t.self.get(parent.name) ?? 0) - e.dur);
    else if (!parent) t.busy += e.dur;
    t.self.set(e.name, (t.self.get(e.name) ?? 0) + e.dur);
    t.stack.push({ name: e.name, end });
  }
  const rows = [...threads.values()].map((t) => ({
    thread: threadNames.get(t.key) ?? t.key,
    process: processNames.get(t.pid) ?? String(t.pid),
    busyMs: round(t.busy / 1000, 0),
    busyPct: span ? round((100 * t.busy) / 1000 / span, 1) : null,
    top: [...t.self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([name, us]) => ({ name, ms: round(us / 1000, 1) })),
  }));
  return { spanMs: round(span, 0), events: traceEvents.length, threads: rows.sort((a, b) => b.busyMs - a.busyMs).slice(0, 10) };
}

async function runProbe() {
  const cases = [];
  for (const route of ROUTES) for (const condition of CONDITIONS.filter((c) => c.rate === (c.width === 360 ? 4 : 1))) cases.push({ route, ...condition });
  const summaries = [];
  const capture = async (c, label, method, name, run) => {
    const out = await run();
    if (method === "profile") {
      writeFileSync(join(OUT, `${name}.cpuprofile.gz`), gzipSync(JSON.stringify(out)));
      summaries.push({ ...c, label, kind: "profile", ...(await summarizeProfile(out)) });
    } else {
      writeFileSync(join(OUT, `${name}.trace.json.gz`), gzipSync(out));
      summaries.push({ ...c, label, kind: "trace", ...analyzeTrace(out) });
    }
  };
  for (const c of cases) {
    if (overBudget()) {
      console.log("The budget ended in the probe.");
      return;
    }
    const stem = `${c.route}-${c.width}-x${c.rate}`;
    begin(`probe ${stem}`);
    // The profile. The sample interval is 1 ms, so the overhead stays small.
    const profileWork = async () => {
      enter("launch for profile");
      const { browser, page, cdp } = await open(c);
      try {
        enter("goto");
        await page.goto(urlOf(c.route), { waitUntil: "load", timeout: GOTO_LIMIT_MS });
        await sleep(SETTLE_MS);
        enter("profile idle");
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.setSamplingInterval", { interval: 1000 });
        const profiled = async (work) => {
          await cdp.send("Profiler.start");
          await work();
          return (await cdp.send("Profiler.stop")).profile;
        };
        await capture(c, "idle", "profile", `profile-${stem}-idle`, () => profiled(() => sleep(IDLE_MS)));
        enter("profile scroll");
        await capture(c, "scroll", "profile", `profile-${stem}-scroll`, () => profiled(() => scrollDown(page, cdp, c.width, c.height)));
      } finally {
        enter("close");
        await closeBrowser(browser);
      }
    };
    await limited(`profile ${stem}`, PROBE_LIMIT_MS, profileWork).catch((error) => summaries.push({ ...c, kind: "profile", error: String(error).slice(0, 400), stoppedIn: stage.name }));
    // The trace is a second page, so its overhead does not change the profile.
    const traceWork = async () => {
      enter("launch for trace");
      const { browser, page, cdp } = await open(c);
      try {
        enter("goto");
        await page.goto(urlOf(c.route), { waitUntil: "load", timeout: GOTO_LIMIT_MS });
        await sleep(SETTLE_MS);
        enter("trace idle");
        const traced = async (work) => {
          await browser.startTracing(page, { categories: TRACE_CATEGORIES });
          await work();
          return browser.stopTracing();
        };
        await capture(c, "idle", "trace", `trace-${stem}-idle`, () => traced(() => sleep(Math.min(IDLE_MS, 6000))));
        enter("trace scroll");
        await capture(c, "scroll", "trace", `trace-${stem}-scroll`, () => traced(() => scrollDown(page, cdp, c.width, c.height)));
      } finally {
        enter("close");
        await closeBrowser(browser);
      }
    };
    await limited(`trace ${stem}`, PROBE_LIMIT_MS, traceWork).catch((error) => summaries.push({ ...c, kind: "trace", error: String(error).slice(0, 400), stoppedIn: stage.name }));
    writeFileSync(join(OUT, `probe-${SHARD}.json`), JSON.stringify(summaries, null, 1));
    console.log(`probe ${stem} done`);
  }
}

const LOAD_COLUMNS = ["fcp", "lcp", "tbt", "cls", "longtasks", "longest", "jsEncodedMain", "cssEncodedMain", "jsEncodedFrames", "documents", "headRequests", "nodes", "frames"];
const PHASE_COLUMNS = ["fps", "p50", "p95", "p99", "over33", "over33Pct", "longtasks", "longtaskMs", "loaf", "loafBlockingMs", "busyPct", "scriptPct", "layoutPct", "stylePct"];

function spread(values) {
  const v = values.filter((x) => typeof x === "number" && Number.isFinite(x));
  if (!v.length) return null;
  return { median: round(median(v)), min: Math.min(...v), max: Math.max(...v), n: v.length };
}

function cell(s) {
  return s ? `${s.median} [${s.min}, ${s.max}]` : "n/a";
}

function table(title, groups, read, columns) {
  const lines = [`## ${title}`, "", `| Case | n | ${columns.join(" | ")} |`, `| --- | --- | ${columns.map(() => "---").join(" | ")} |`];
  for (const [name, records] of groups) {
    const usable = records.filter((r) => !r.error);
    lines.push(`| ${name} | ${usable.length}/${records.length} | ${columns.map((c) => cell(spread(usable.map((r) => read(r)?.[c])))).join(" | ")} |`);
  }
  return [...lines, ""];
}

function summarize() {
  const records = [];
  for (const file of readdirSync(OUT).filter((f) => f.startsWith("samples-") && f.endsWith(".jsonl"))) {
    for (const line of readFileSync(join(OUT, file), "utf8").split("\n")) if (line.trim()) records.push(JSON.parse(line));
  }
  const groups = new Map();
  for (const r of records) {
    const name = `${r.target} ${r.case}`;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(r);
  }
  const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  const summary = {};
  for (const [name, list] of sorted) {
    const usable = list.filter((r) => !r.error);
    const pick = (read, columns) => Object.fromEntries(columns.map((c) => [c, spread(usable.map((r) => read(r)?.[c]))]));
    summary[name] = {
      samples: list.length,
      errors: list.filter((r) => r.error).map((r) => r.error),
      frameCount: usable.map((r) => r.frameCountEnd ?? r.frameCount),
      calibrateMs: spread(list.map((r) => r.calibrateMs)),
      load: pick((r) => r.load?.stats, LOAD_COLUMNS),
      afterScroll: pick((r) => r.afterScroll, LOAD_COLUMNS),
      idle: pick((r) => r.idle?.stats, PHASE_COLUMNS),
      scroll: pick((r) => r.scroll?.stats, PHASE_COLUMNS),
      siteMeterWorkMs: spread(usable.map((r) => r.idle?.meter?.workMs)),
      gesture: usable.map((r) => r.scroll?.gesture),
      lcpTag: usable[0]?.load?.stats?.lcpTag ?? null,
      idleScripts: usable[0]?.idle?.attribution,
      scrollScripts: usable[0]?.scroll?.attribution,
      errorsInPage: [...new Set(usable.flatMap((r) => r.errors ?? []))].slice(0, 5),
      unsupported: [...new Set(usable.flatMap((r) => r.unsupported ?? []))],
    };
  }
  writeFileSync(join(OUT, `summary-${SHARD}.json`), JSON.stringify(summary, null, 1));
  const markdown = [
    `# Lag records: ${SHARD}`,
    "",
    "Each cell is the median, then the range. The columns of time are in ms. The columns of percent are the share of wall time.",
    "",
    ...table("Load", sorted, (r) => r.load?.stats, LOAD_COLUMNS),
    ...table("After the scroll", sorted, (r) => r.afterScroll, ["jsEncodedFrames", "documents", "nodes", "frames"]),
    ...table("Idle, 15 s, no input", sorted, (r) => r.idle?.stats, PHASE_COLUMNS),
    ...table("Scroll", sorted, (r) => r.scroll?.stats, PHASE_COLUMNS),
  ].join("\n");
  writeFileSync(join(OUT, `summary-${SHARD}.md`), markdown);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, markdown);
  console.log(markdown);
}

async function meta() {
  const browser = await chromium.launch({ channel: "chromium", headless: true, args: ARGS });
  const version = browser.version();
  await browser.close();
  const record = { target: TARGET, base: BASE, shard: SHARD, browser: version, node: process.version, cpu: cpus()[0]?.model, cores: cpus().length, repeats: REPEATS, idleMs: IDLE_MS, settleMs: SETTLE_MS, args: ARGS, startedAt: new Date().toISOString() };
  writeFileSync(join(OUT, `meta-${SHARD}.json`), JSON.stringify(record, null, 1));
  console.log(record);
}

if (!MODES.every((m) => m === "summarize")) await meta();
for (const mode of MODES) {
  if (mode === "census") await runCensus();
  if (mode === "grid") await runRounds(gridCases(), `samples-${SHARD}.jsonl`);
  if (mode === "causes") await runRounds(causeCases(), `samples-${SHARD}.jsonl`);
  if (mode === "probe") await runProbe();
  if (mode === "summarize") summarize();
}

// An open handle must not keep the job alive after the work ends.
await closeAll();
process.exit(0);
