# Roadmap

This file is the one list of the work on the portfolio site. Each item has an ID and a status. The tracker of the fleet mirrors this file, and the Status page of the site shows it.

The statuses are `done`, `in progress`, `next` and `later`.

## The site

| ID | Item | Status | Depends on | PR |
| --- | --- | --- | --- | --- |
| P1 | The repository from the template, with the site on GitHub Pages and the text in STE | done (2026-10-08) | | |
| P2 | The pool of live sites, with the Pond, Board and River views, phone layouts and the basics for search engines | done (2026-10-09) | P1 | |
| P3 | The build finds the Pages sites of all public repositories | done (2026-10-24) | P2 | #3 |
| P4 | The board, river and pond layouts come from the items | done (2026-10-24) | P2 | #4 |
| P5 | Written cards for highways, layout-contract, packing and codeatlas | done (2026-10-29) | P3 | #11, #28, #32, #35 |
| P6 | The UX round each week: better views and more interactive visuals | next | P2 | |
| P7 | A new site shows at once, through a dispatch from its repository | later | P8 | |

## The automation

| ID | Item | Status | Depends on | PR |
| --- | --- | --- | --- | --- |
| P8 | An hourly discovery deploys only when the list of sites changes, and writes `uncurated.json` | done (2026-10-27) | P3 | #28, #29 |
| P9 | The card sweep: the organizer writes a card on the same day for each site with an automatic card | in progress (each day) | P8 | |

## The checks

| ID | Item | Status | Depends on | PR |
| --- | --- | --- | --- | --- |
| P10 | The AI review of pull requests, the shared security scans and Renovate | done (2026-10-25) | P1 | #5, #6, #7 |
| P11 | The shared Pages workflow, with the Status and Releases pages | done (2026-10-29) | P8 | #33 |
| P12 | The gates fail closed: `CI OK`, `Security OK`, a type check of all the code and a guard against an empty list of sites | done (2026-10-30) | P10 | #36, #37, #40, #41 |
| P13 | The shared conventions check, version 0.7.0, with the rule `roadmap-parses` | done (2026-10-30) | P12 | #45, #49 |
| P14 | This roadmap, on the Status page and in the tracker of the fleet | done (2026-10-30) | P11, P13 | #47 |

## The lag of the site

| ID | Item | Status | Depends on | PR |
| --- | --- | --- | --- | --- |
| P15 | The Pond shows a poster for each card, and a site starts only on request | done (2026-11-04) | P2 | #94 |
| P16 | The Board and the River show posters in the same way | done (2026-11-04) | P15 | #96 |
| P17 | Find the cause of the slow Pond rounds on a phone, and of the late poster paint, with a CPU trace in CI | done (2026-11-04) | P15 | #99 |
| P18 | Remove the blur behind the tiles | done (2026-11-04) | P17 | #100 |
| P19 | A limit on the lag of the site in CI | done (2026-11-04) | P18 | #101 |
| P20 | Make `Lag limits OK` a merge gate | later | P19 | |

P15 appeared to have two modes on a phone at 360, four times slower than a normal CPU.
The two modes were a fault of the measure, which dropped a task that started before the first paint.
The measure counts each task that ends after the first paint.

A trace of 12 rounds shows the cause. One task of 728 to 982 ms is in each round, and it is `Water.create`, which waits for the first WebGL call.
After #99, the water starts after the first paint. CI uses a software renderer in all these numbers, so a real GPU can be faster.

| Pond, 360, four times slower, median of 5 | Before #99 | After #99 | A/A |
| --- | --- | --- | --- |
| Total blocking time | 547 ms | 217 ms | 227 ms |
| Longest task | 505 ms | 234 ms | 254 ms |
| Largest paint | 876 ms | 916 ms | 896 ms |

The largest paint did not change, and a block of approximately 200 ms stays on this phone profile.

P18 removes `backdrop-filter` from the tiles. The tile plate is 86% opaque, so the blur showed little, and each frame of the water paid for it.

| Idle frames per second, median of 5 | With the blur | Without | A/A |
| --- | --- | --- | --- |
| Pond, 360, four times slower | 23.7 | 45.3 | 45.7 |
| River, 360, four times slower | 21.4 | 25.4 | 25.5 |
| Pond, 1280 | 11.5 | 16.2 | 16.2 |
| River, 1280 | 12.4 | 17.2 | 17.1 |
| Board, 1280 | 41.2 | 60 | 60 |

These numbers compare arms inside one run. They do not give the frame rate on a real device.

P19 adds the workflow `lag-budget.yml`. At 360, with a CPU four times slower, the median of 6 rounds of each route stays at or below these limits.

| Measure | Limit | Largest A/A difference |
| --- | ---: | ---: |
| Total blocking time | 450 ms | 200 ms |
| Longest task | 450 ms | 200 ms |
| Frames of the page | 2 | 1 |
| Nodes | 5000 | 500 |

Only the outcome `within` passes. A control round in each run has a task of 800 ms, so the run proves that the measure can see a long task.
The runner has no GPU, so the frame rate has no limit.

Two gaps stay open in P19. The A/A differences of 1 for the frames and 500 for the nodes are choices, not measured values.
The workflow does not stop a merge at this time, because one round above a limit gives `cannot decide`, and a slow runner can cause that.
P20 makes it a merge gate after 8 runs on main with no false failure. The weekly run and each pull request of the site count.

The transparent rectangle that a visitor saw is not reproduced in a software renderer. No real GPU was tested, so it is not shown as fixed.
