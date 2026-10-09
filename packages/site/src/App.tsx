import { type ReactElement, useCallback, useEffect, useState } from "react";
import { Board } from "./board/Board.tsx";
import { type ConceptId, type ConceptProps, concepts } from "./concept.ts";
import { itemById, links, sites } from "./content.ts";
import { Expanded, type Origin } from "./expand.tsx";
import { useReducedMotion } from "./loop.ts";
import { Pond } from "./pond/Pond.tsx";
import { River } from "./river/River.tsx";

const views: Record<ConceptId, (props: ConceptProps) => ReactElement> = { pond: Pond, board: Board, river: River };

interface Route {
  readonly concept: ConceptId;
  readonly open: string | null;
}

/** This function reads the route from the hash of the address, for example `#pond/vex`. */
function readRoute(): Route {
  const [first, second] = location.hash.slice(1).split("/");
  const concept = concepts.find((c) => c.id === first)?.id ?? "pond";
  const open = second && itemById(second)?.kind === "site" ? second : null;
  return { concept, open };
}

/** This function finds the card of an item in the pool, and gives its place on the screen and its corner radius. */
function originOf(id: string): Origin | null {
  const element = document.querySelector<HTMLElement>(`.concept [data-id="${CSS.escape(id)}"]`);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width < 4) return null;
  const raw = getComputedStyle(element).borderTopLeftRadius;
  const radius = raw.endsWith("%") ? (rect.width * Number.parseFloat(raw)) / 100 : Number.parseFloat(raw) || 0;
  return { rect, radius };
}

export function App(): ReactElement {
  const [route, setRoute] = useState(readRoute);
  const reduced = useReducedMotion();

  useEffect(() => {
    const change = (): void => setRoute(readRoute());
    addEventListener("hashchange", change);
    return () => removeEventListener("hashchange", change);
  }, []);

  const open = useCallback(
    (id: string) => {
      history.pushState(null, "", `#${route.concept}/${id}`);
      setRoute({ concept: route.concept, open: id });
    },
    [route.concept],
  );

  const closed = useCallback(() => {
    history.replaceState(null, "", `#${route.concept}`);
    setRoute({ concept: route.concept, open: null });
  }, [route.concept]);

  const View = views[route.concept];
  const site = sites.find((s) => s.id === route.open);
  const hint = concepts.find((c) => c.id === route.concept)?.hint ?? "";

  return (
    <div className="app">
      <header className="bar">
        <a className="wordmark" href={links.github}>
          Mark Russell
        </a>
        <nav className="tabs" aria-label="Concepts of the pool">
          {concepts.map((c) => (
            <a key={c.id} href={`#${c.id}`} aria-current={c.id === route.concept ? "page" : undefined}>
              {c.name}
            </a>
          ))}
        </nav>
        <p className="bar-note">{hint}</p>
      </header>
      <main className="stage">
        <View key={route.concept} onOpen={open} reduced={reduced} paused={site !== undefined} />
      </main>
      {site ? <Expanded key={site.id} site={site} origin={() => originOf(site.id)} onClosed={closed} reduced={reduced} /> : null}
    </div>
  );
}
