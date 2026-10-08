# mark1russell7.github.io

This repository contains the portfolio of Mark Russell. GitHub Pages publishes it at <https://mark1russell7.github.io/>.

The project sites of other repositories are on the same domain, for example [lag](https://mark1russell7.github.io/lag/).

## Layout

The repository is a pnpm workspace from [template](https://github.com/mark1russell7/template). Each package extends a TypeScript preset of [`@mark1russell7/cue`](https://github.com/mark1russell7/cue).

| Package | Function |
| --- | --- |
| `packages/site` | The site, with Vite and React. The workflow `pages.yml` deploys it. |
| `packages/cli` | The tools of the repository, for example `pnpm package add <name>`. |

## Commands

```sh
pnpm install
pnpm dev         # the site at http://localhost:5173
pnpm build       # every package; the site builds to packages/site/dist
pnpm typecheck
pnpm test
pnpm lint:ste    # the writing rules
pnpm package add <name> --preset=<node|node-cjs|ts|vite|react>
```

## Writing style

The text of this repository uses the writing rules of ASD-STE100 Simplified Technical English (STE) as a style target. This text is the README files, the TSDoc comments and the text that the site shows. ASD does not certify the repository. The linter [`ste-lint`](https://github.com/mark1russell7/ste-lint) is an automated approximation of the rules, and CI starts it for each push.

- Use `pnpm lint:ste` to examine the text, and correct each finding.
- The glossary of the project is in `ste.config.json`. Add a word to the glossary only if it is a real technical term of the project.
- The ASD-STE100 dictionary is copyrighted. Do not commit it. Keep a local copy in the folder `.ste/`, which git ignores. The README of `ste-lint` gives the file format.

## Disclosure

An AI model (Claude, from Anthropic) wrote most of the text and the code of this repository, under the direction of the author. The STE linter examines the text. The STEMG of ASD-STE100 asks for this disclosure in its white paper on STE and artificial intelligence (June 2026).
