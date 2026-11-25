// This script finds the public repositories of each owner in OWNERS that have a GitHub Pages site, and writes them to
// src/discovered.json. The Pages workflow starts it before each build, and the build gives each site that
// content.ts does not describe an automatic card. An hourly check rebuilds the pool when the list changed, so a new site shows in an hour.
//   node packages/site/scripts/discover.ts           (GITHUB_TOKEN is optional, it raises the rate limit)
import { readFileSync, writeFileSync } from "node:fs";
import { OWNERS } from "@mark1russell7/conventions/owners";

// A repository can move to another owner. Its site then has the Pages host of that owner, so each owner is read.
const out = new URL("../src/discovered.json", import.meta.url);

interface Repo { owner: { login: string }; name: string; description: string | null; homepage: string | null; has_pages: boolean; private: boolean; fork: boolean; archived: boolean }

const headers: Record<string, string> = { accept: "application/vnd.github+json", "user-agent": "portfolio-discover" };
const token = process.env["GITHUB_TOKEN"];
if (token) headers["authorization"] = `Bearer ${token}`;

const repos: Repo[] = [];
for (const { login } of OWNERS) {
  for (let page = 1; page < 20; page++) {
    // The path users/<login>/repos lists the repositories of a user and of an organization.
    const res = await fetch(`https://api.github.com/users/${login}/repos?per_page=100&type=owner&page=${page}`, { headers });
    if (!res.ok) {
      console.error(`discover: GitHub answered ${res.status} for ${login}. The build keeps the list in src/discovered.json.`);
      process.exit(0);
    }
    const batch = (await res.json()) as Repo[];
    repos.push(...batch);
    if (batch.length < 100) break;
  }
}

// The path of a site is its key on this domain. When two owners have a site of the same name, the first owner of OWNERS keeps it.
const seen = new Set<string>();
const found = repos
  .filter((r) => r.has_pages && !r.private && !r.fork && !r.archived && r.name.toLowerCase() !== `${r.owner.login.toLowerCase()}.github.io`)
  .filter((r) => {
    const key = r.name.toLowerCase();
    if (seen.has(key)) {
      console.log(`discover: ${r.owner.login}/${r.name} has the name of a site of an earlier owner, so it gets no card`);
      return false;
    }
    seen.add(key);
    return true;
  })
  .map((r) => ({ repo: r.name, owner: r.owner.login, path: `/${r.name}/`, description: (r.description ?? "").trim() }))
  .sort((a, b) => a.repo.localeCompare(b.repo));

// No site at all means a wrong answer, not a real list: keep the old list and fail, so the build does not drop every automatic card.
if (found.length === 0) {
  console.error(`discover: GitHub listed ${repos.length} repositories and none with a Pages site; expected at least one. src/discovered.json stays as it is.`);
  process.exit(1);
}

const before = JSON.parse(readFileSync(out, "utf8")) as { repo: string }[];
const known = new Set(before.map((r) => r.repo));
const now = new Set(found.map((r) => r.repo));
for (const r of found) if (!known.has(r.repo)) console.log(`discover: new site ${r.repo}`);
for (const r of before) if (!now.has(r.repo)) console.log(`discover: site gone ${r.repo}`);
writeFileSync(out, JSON.stringify(found, null, 2) + "\n");
console.log(`discover: ${found.length} sites`);
