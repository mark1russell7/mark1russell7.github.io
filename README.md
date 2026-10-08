# mark1russell7.github.io

Source of my portfolio, published to <https://mark1russell7.github.io/>.

Project sites in their own repos are served under the same domain, for example
[lag](https://mark1russell7.github.io/lag/).

## Layout

A pnpm workspace scaffolded from [template](https://github.com/mark1russell7/template). Every package
extends a TypeScript preset from [`@mark1russell7/cue`](https://github.com/mark1russell7/cue).

| Package           | What it is                                         |
| ----------------- | -------------------------------------------------- |
| `packages/site`   | The site: Vite + React, deployed by `pages.yml`    |
| `packages/cli`    | Repo tooling: `pnpm package add <name>`            |

## Commands

```sh
pnpm install
pnpm dev         # the site at http://localhost:5173
pnpm build       # every package; the site builds to packages/site/dist
pnpm typecheck
pnpm test
pnpm package add <name> --preset=<node|node-cjs|ts|vite|react>
```
