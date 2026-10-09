import { type CSSProperties, type ReactElement, useEffect, useLayoutEffect, useRef } from "react";
import type { Site } from "./content.ts";

/** The place on the screen that the panel opens from and closes to. */
export interface Origin {
  readonly rect: DOMRect;
  /** The corner radius of the card, in pixels. */
  readonly radius: number;
}

function frames(origin: Origin | null): Keyframe[] {
  const width = innerWidth;
  const height = innerHeight;
  if (!origin) {
    return [
      { transform: "translateY(24px) scale(0.96)", clipPath: "inset(0 0 0 0 round 24px)", opacity: 0 },
      { transform: "none", clipPath: "inset(0 0 0 0 round 0px)", opacity: 1 },
    ];
  }
  const { rect, radius } = origin;
  const scale = rect.width / width;
  const visible = Math.min(height, rect.height / scale);
  return [
    {
      transform: `translate(${rect.left}px, ${rect.top}px) scale(${scale})`,
      clipPath: `inset(0 0 ${height - visible}px 0 round ${radius / scale}px)`,
      opacity: 1,
    },
    { transform: "translate(0px, 0px) scale(1)", clipPath: "inset(0 0 0px 0 round 0px)", opacity: 1 },
  ];
}

const timing: KeyframeAnimationOptions = { duration: 520, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)", fill: "both" };

/**
 * This component opens a site in a panel that fills the window. The panel grows from the card, and the site in it is interactive.
 * When the panel closes, it shrinks back to the card.
 */
export function Expanded(props: { site: Site; origin: () => Origin | null; onClosed: () => void; reduced: boolean }): ReactElement {
  const { site, origin, onClosed, reduced } = props;
  const panelRef = useRef<HTMLDivElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    if (!reduced) {
      panel.animate(frames(origin()), timing);
      backdropRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { ...timing, duration: 400 });
    }
    closeRef.current?.focus({ preventScroll: true });
    // The panel animates one time, when it opens.
  }, []);

  const close = (): void => {
    const panel = panelRef.current;
    if (closing.current || !panel) return;
    closing.current = true;
    if (reduced) {
      onClosed();
      return;
    }
    const animation = panel.animate([...frames(origin())].reverse(), { ...timing, duration: 420 });
    backdropRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { ...timing, duration: 420 });
    animation.onfinish = onClosed;
  };

  useEffect(() => {
    const key = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  });

  return (
    <div className="expanded" role="dialog" aria-modal="true" aria-label={site.name}>
      <div className="expanded-backdrop" ref={backdropRef} onClick={close} />
      <div className="expanded-panel" ref={panelRef} style={{ "--hue": site.hue } as CSSProperties}>
        <header className="expanded-bar">
          <span className="expanded-dot" />
          <strong>{site.name}</strong>
          <span className="expanded-blurb">{site.blurb}</span>
          <a href={site.path} target="_blank" rel="noopener">
            Open in a new tab
          </a>
          <button ref={closeRef} type="button" onClick={close}>
            Close
          </button>
        </header>
        <iframe
          src={site.path}
          title={`The site of ${site.name}`}
          onLoad={(event) => {
            // Esc in the site closes the panel too. The site has the same origin, so the page can listen to its keys.
            try {
              event.currentTarget.contentWindow?.addEventListener("keydown", (key) => {
                if (key.key === "Escape") close();
              });
            } catch {
              // A site on a different origin keeps its keys.
            }
          }}
        />
      </div>
    </div>
  );
}
