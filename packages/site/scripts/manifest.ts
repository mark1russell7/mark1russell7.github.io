// This script writes two files into dist after the build, for the checks that run outside the build:
//   discovered.json: the sites that discover.ts found. The hourly run of the Pages workflow compares it with a new
//                    discovery, and deploys only when the list changed.
//   uncurated.json:  the repositories whose site has an automatic card, and no card in `curated`. The fleet sweep
//                    reads it, so the organizer writes a card for each new site on the same day.
//   node packages/site/scripts/manifest.ts           (after pnpm --filter @portfolio/site build)
import { writeFileSync } from "node:fs";
import discovered from "../src/discovered.json" with { type: "json" };
import { curated } from "../src/content.ts";

const dist = new URL("../dist/", import.meta.url);
const written = new Set(curated.map((site) => site.path.toLowerCase()));
const uncurated = discovered.filter((found) => !written.has(found.path.toLowerCase())).map((found) => found.repo);

writeFileSync(new URL("discovered.json", dist), JSON.stringify(discovered, null, 2) + "\n");
writeFileSync(new URL("uncurated.json", dist), JSON.stringify(uncurated) + "\n");
console.log(`manifest: ${discovered.length} sites, ${uncurated.length} with no written card${uncurated.length ? `: ${uncurated.join(", ")}` : ""}`);
