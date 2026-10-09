import { type CSSProperties, type ReactElement, useEffect, useRef, useState } from "react";
import { type Item, links, type Pebble, proof, type Site, type Tile } from "./content.ts";
import { meter } from "./loop.ts";

/** The size of the viewport in the frame of a site, before the frame scales it. */
export const FRAME_WIDTH = 1280;
export const FRAME_HEIGHT = 800;

/** The height of the caption under the frame of a site, in pixels. */
export const CAPTION_HEIGHT = 58;

/**
 * This function moves the document in the frame to the element that `selector` finds.
 * The site and this page have the same origin, so the page can read the document of the frame.
 */
function prepareFrame(frame: HTMLIFrameElement, selector: string | undefined): void {
  let tries = 0;
  const run = (): void => {
    let doc: Document | null = null;
    try {
      doc = frame.contentDocument;
    } catch {
      return;
    }
    if (!doc?.documentElement) return;
    doc.documentElement.style.scrollbarWidth = "none";
    if (!selector) return;
    const target = doc.querySelector(selector);
    const view = frame.contentWindow;
    if (target && view) {
      const rect = target.getBoundingClientRect();
      view.scrollTo({ top: Math.max(0, view.scrollY + rect.top + rect.height / 2 - FRAME_HEIGHT / 2), behavior: "instant" });
    } else if (tries++ < 20) {
      setTimeout(run, 150);
    }
  };
  run();
}

/**
 * This component shows a site live in a frame. The frame has the size of a desktop viewport, and a transform scales it to `width` and `height`.
 * The frame covers the box, and the box clips the edges of the frame.
 */
export function SiteFrame(props: { site: Site; width: number; height: number; interactive?: boolean }): ReactElement {
  const { site, width, height, interactive = false } = props;
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const scale = Math.max(width / FRAME_WIDTH, height / FRAME_HEIGHT);
  const offsetX = (width - FRAME_WIDTH * scale) / 2;
  const offsetY = (height - FRAME_HEIGHT * scale) / 2;
  const frameStyle: CSSProperties = {
    width: FRAME_WIDTH,
    height: FRAME_HEIGHT,
    transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})`,
    pointerEvents: interactive ? "auto" : "none",
    opacity: loaded ? 1 : 0,
  };
  return (
    <div className="frame" style={{ width, height, "--hue": site.hue } as CSSProperties}>
      <div className="frame-poster" style={site.poster ? { backgroundImage: `url(${site.poster})` } : undefined}>
        {site.poster ? null : <span>{site.name}</span>}
      </div>
      <iframe
        ref={frameRef}
        src={site.path}
        title={`The site of ${site.name}`}
        tabIndex={interactive ? 0 : -1}
        aria-hidden={interactive ? undefined : true}
        style={frameStyle}
        onLoad={() => {
          if (frameRef.current) prepareFrame(frameRef.current, site.focus);
          setLoaded(true);
        }}
      />
    </div>
  );
}

/** This component shows the name and the description of a site under its frame. */
export function SiteCaption({ site, scale = 1 }: { site: Site; scale?: number }): ReactElement {
  return (
    <div className="caption" style={{ height: CAPTION_HEIGHT * scale, "--cs": scale } as CSSProperties}>
      <strong>{site.name}</strong>
      <span>{site.blurb}</span>
    </div>
  );
}

interface PushEvent {
  readonly repo: string;
  readonly message: string;
  readonly at: string;
}

const RECENT_KEY = "pool:recent";

/** This hook gets the recent pushes of the author from the public GitHub API. The final site gets them when it builds. */
function useRecentWork(): PushEvent[] | "error" | null {
  const [events, setEvents] = useState<PushEvent[] | "error" | null>(() => {
    try {
      const cached = sessionStorage.getItem(RECENT_KEY);
      return cached ? (JSON.parse(cached) as PushEvent[]) : null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (events) return undefined;
    const controller = new AbortController();
    fetch("https://api.github.com/users/mark1russell7/events/public?per_page=40", { signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<unknown[]>) : Promise.reject(new Error(String(response.status)))))
      .then((data) => {
        const out: PushEvent[] = [];
        for (const raw of data) {
          const event = raw as { type?: string; repo?: { name?: string }; created_at?: string; payload?: { commits?: { message?: string }[] } };
          if (event.type !== "PushEvent") continue;
          const repo = event.repo?.name?.split("/")[1] ?? "";
          if (out.some((e) => e.repo === repo)) continue;
          const commits = event.payload?.commits ?? [];
          const message = (commits[commits.length - 1]?.message ?? "").split("\n")[0] ?? "";
          out.push({ repo, message, at: event.created_at ?? "" });
          if (out.length === 4) break;
        }
        try {
          sessionStorage.setItem(RECENT_KEY, JSON.stringify(out));
        } catch {
          // The cache is optional.
        }
        setEvents(out);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEvents("error");
      });
    return () => controller.abort();
  }, [events]);
  return events;
}

function ago(iso: string): string {
  const minutes = Math.max(1, Math.round((Date.now() - Date.parse(iso)) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} d`;
}

function NowBody(): ReactElement {
  const events = useRecentWork();
  return (
    <>
      <h3>Recent work</h3>
      {events === "error" || (events && events.length === 0) ? (
        <p>
          The activity is on <a href={links.github}>GitHub</a>.
        </p>
      ) : (
        <ul className="now">
          {(events ?? [null, null, null]).map((event, index) =>
            event ? (
              <li key={event.repo}>
                <span className="now-repo">{event.repo}</span>
                <span className="now-at">{ago(event.at)}</span>
                <span className="now-msg">{event.message}</span>
              </li>
            ) : (
              <li key={index} className="now-empty" />
            ),
          )}
        </ul>
      )}
    </>
  );
}

function MeterBody(): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [work, setWork] = useState(0);
  const [fps, setFps] = useState(60);
  useEffect(() => {
    const id = setInterval(() => {
      const samples = meter.ordered();
      const recent = samples.slice(-30);
      setWork(recent.reduce((a, b) => a + b, 0) / recent.length);
      setFps(meter.fps);
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(230, 240, 236, 0.18)";
      ctx.beginPath();
      const budget = h - (16.7 / 20) * h;
      ctx.moveTo(0, budget);
      ctx.lineTo(w, budget);
      ctx.stroke();
      ctx.fillStyle = "#FF7C6C";
      const bar = w / samples.length;
      samples.forEach((value, k) => {
        const barHeight = Math.min(h, (value / 20) * h);
        ctx.fillRect(k * bar, h - barHeight, Math.max(1, bar - 1), barHeight);
      });
    }, 200);
    return () => clearInterval(id);
  }, []);
  return (
    <>
      <h3>This page</h3>
      <canvas ref={canvasRef} width={240} height={44} className="meter" aria-hidden="true" />
      <p>
        The pool uses <strong>{work.toFixed(1)} ms</strong> of each frame, at {Math.round(fps)} frames each second. The line is the
        budget of one frame at 60 Hz.
      </p>
    </>
  );
}

/** This component shows the content of a tile. */
export function TileBody({ tile }: { tile: Tile }): ReactElement {
  switch (tile.id) {
    case "me":
      return (
        <>
          <h2 className="me-name">Mark Russell</h2>
          <p>Mark Russell makes TypeScript libraries for the browser and for Node.js. Each library has a site with a live demo, the test results and a specification.</p>
          <p className="tile-links">
            <a href={links.github}>GitHub</a>
            <a href={links.npm}>npm</a>
          </p>
        </>
      );
    case "proof":
      return (
        <>
          <h3>The numbers</h3>
          <dl className="proof">
            {proof.map((entry) => (
              <div key={entry.label}>
                <dt>{entry.value}</dt>
                <dd>{entry.label}</dd>
              </div>
            ))}
          </dl>
        </>
      );
    case "now":
      return <NowBody />;
    case "craft":
      return (
        <>
          <h3>Plain words</h3>
          <p>
            The text of each site obeys the rules of ASD-STE100 Simplified Technical English. The linter <a href={`${links.github}/ste-lint`}>ste-lint</a>{" "}
            examines it in CI.
          </p>
        </>
      );
    case "meter":
      return <MeterBody />;
  }
}

/** This component shows the content of a pebble. */
export function PebbleBody({ pebble }: { pebble: Pebble }): ReactElement {
  return (
    <>
      <span className="pebble-dot" />
      <span className="pebble-text">
        <strong>{pebble.name}</strong>
        <span>{pebble.blurb}</span>
      </span>
    </>
  );
}

/**
 * This component shows an item as a flat card with the size `width` and `height`. The pond, the board and the river use it.
 * A site card is a link to the site, and `onOpen` gets the click.
 */
export function PlateCard(props: {
  item: Item;
  width: number;
  height: number;
  interactive?: boolean;
  onOpen?: (id: string, element: HTMLElement) => void;
  cardRef?: (element: HTMLElement | null) => void;
  className?: string;
  style?: CSSProperties;
  /** The scale of the card, from its base size. The caption and the text of a pebble use this scale. */
  scale?: number;
}): ReactElement {
  const { item, width, height, onOpen, cardRef, interactive = false, scale = 1 } = props;
  const style = { width, height, "--hue": item.hue, "--k": scale, ...props.style } as CSSProperties;
  const className = `card card-${item.kind} ${props.className ?? ""}`;
  if (item.kind === "site") {
    return (
      <a
        ref={cardRef}
        href={item.path}
        className={className}
        style={style}
        data-id={item.id}
        draggable={false}
        aria-label={`${item.name}: ${item.blurb}`}
        onClick={(event) => {
          if (!onOpen || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
          event.preventDefault();
          onOpen(item.id, event.currentTarget);
        }}
      >
        <SiteFrame site={item} width={width} height={height - CAPTION_HEIGHT * scale} interactive={interactive} />
        <SiteCaption site={item} scale={scale} />
      </a>
    );
  }
  if (item.kind === "pebble") {
    return (
      <a ref={cardRef} href={item.href} className={className} style={style} data-id={item.id} draggable={false}>
        <PebbleBody pebble={item} />
      </a>
    );
  }
  return (
    <article ref={cardRef} className={className} style={style} data-id={item.id}>
      <TileBody tile={item} />
    </article>
  );
}
