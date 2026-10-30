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
| P13 | The shared conventions check, version 0.6.0, with the rule `roadmap-parses` | done (2026-10-30) | P12 | #45 |
| P14 | This roadmap, on the Status page and in the tracker of the fleet | in progress | P11, P13 | |
