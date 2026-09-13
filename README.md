# patiopyro

A show design application for backyard fireworks.

PatioPyro is a browser-only web app for planning 1.4G consumer fireworks shows. You can:
- keep an inventory of cakes, shells and racks
- lay out up to five launch positions on a site map
- draw fuse chains visually
- map them to a wireless firing system
- arrange cue timing on a piano-roll timeline
- print everything you need on show day

There is no server. Your show autosaves in the browser, and you can save or open `.patiopyro.json` files to back up or share a show.

## Features

- **Inventory**
  - Cakes: shots, duration, lead delay, exit fuse, 1.4G / 1.4G Pro-line grade, brand, cost.
  - Cake weight class (200g, 350g, 500g, 1000g+) and color-coded category labels (big breaks, small, medium, long, finale, zipper, NOAB, fan, barrage and more).
  - Shells: effect, size, light-to-burst time, per-shell or bulk-case pricing.
  - Racks: rows × tubes, tube size and spacing.
  - Used vs. owned counts and notes for every item.
- **Fuse library:** green visco, fast visco, time fuse, black match and quickmatch, with editable burn rates and roll pricing (20 ft rolls by default). Pick the default type, set any run's type individually, or apply one type to a whole position.
- **Site map:** a top-down, to-scale yard.
  - Drag positions and the audience line.
  - Safety-radius circles and distance-to-audience labels.
  - Optional background image.
  - Drop inventory onto a position to place it.
- **Position layout:** a node canvas per position.
  - Drag cakes and racks in from the inventory.
  - Add igniters (e-match or Talon) on module cues.
  - Draw fuse between lead fuses, exit fuses, junctions and individual rack tubes.
  - Helpers chain cakes in sequence or fan them out from one junction.
- **Rack editor:** open a rack to load shells tube by tube (click or drag). Lay fuse by clicking tubes in order, or series-fuse a whole rack in one click.
- **Firing systems:** presets for a generic receiver system, COBRA 18R2 (channels and banks), IGNITE (per-module cues, 6-module limit), Bilusocn and P1200-style kits. Add modules, assign them to positions, and link module cues to the same controller cue so they fire together.
- **Timing engine:** computes every effect's ignition and burst time from the cue time, fuse burn time, cake lead and exit fuses, and junction splits (earliest arrival wins).
- **Piano-roll timeline:**
  - Rows by cue or by position, showing effect bars for everything each cue fires.
  - Drag cues in time with snapping; shift-select to move several.
  - Drag onto another row to link cues.
  - Play/scrub playhead.
- **Reports:**
  - Totals for fuse by type (with tie-in allowance, waste and rolls), igniters with spares, cues used vs. available, and module usage.
  - Checks: over-allocated inventory, unconnected items, too many igniters per cue, cues out of range, and positions too close to the audience.
  - Show cost, plus inventory value.
- **Exports:**
  - **Setup worksheet** (print / save as PDF): shopping list with a supplies checklist (fuse tape, fuse cutter, cling film, PPE and stabilization supplies by default; edit it in Settings), module map, and per-position placement checklists, rack loading diagrams and step-by-step fuse chains.
  - **Cost spreadsheet** (`.xlsx` with cost, inventory, fuse and cue sheets, or `.csv`).
  - **Show plan** (print / save as PDF): a large-type cue sheet with times and gaps.
  - **Show mode:** a full-screen countdown to the next cue for running the show.

Burn rates and firing-system specs are typical starting values. Time your own fuse and check your hardware's cue counts and igniter limits. PatioPyro is a planning aid: follow product labels, local laws and safe distances.

## Prerequisites

- **Node.js 22.12 or newer** (Vite and Vitest require it). With [nvm](https://github.com/nvm-sh/nvm): `nvm install 22 && nvm use 22`.
- npm (bundled with Node).

Then install dependencies from the repo root:

```sh
npm install
```

## Running the app

### Development

```sh
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The page reloads as you edit code.

To explore a finished example, choose **File → Load demo show**. Your work autosaves in the browser. Use **File → Save show file** to keep a copy on disk.

### Production build

```sh
npm run build      # type-check, then build the static site into dist/
npm run preview    # serve dist/ locally (usually http://localhost:4173)
```

`dist/` is a fully static site that can be hosted anywhere, including GitHub Pages or any file server. Asset paths are relative, so it also works from a subfolder.

### Deployment

The live app is at **https://tgjohnst.github.io/patiopyro/**.

Every push to `main` runs `.github/workflows/deploy-pages.yml`, which runs the unit tests and build in one job and the Playwright end-to-end tests in another. `dist/` is published to GitHub Pages only if both jobs pass. When the browser tests run, the HTML report and screenshots are uploaded as a `playwright-report` artifact on the run page. To redeploy without a push, run the workflow manually from the repository's **Actions** tab.

## Testing

### Unit tests (Vitest)

These cover the engine: fuse timing, cue addressing and linking, fuse/igniter totals, cost, validation, and show-file loading.

```sh
npm test             # run once
npm run test:watch   # re-run on change
```

### End-to-end tests (Playwright)

These drive the real app in headless Chromium. One test loads the demo show, places a cake, draws fuse, moves a cue and exports reports. The other builds a show from scratch and checks undo, autosave and printing.

One-time setup, to download the browser:

```sh
npx playwright install chromium
# Linux only, if Chromium fails to start with missing shared libraries:
sudo npx playwright install-deps chromium
```

Run the tests:

```sh
npm run e2e                  # starts a dev server on port 5199 automatically
npx playwright test --headed # watch the browser while it runs
npx playwright show-report   # open the HTML report after a failure
```

Screenshots of each screen are saved to `test-results/shots/`.

### Lint and type-check

```sh
npm run lint
npx tsc -b
```

Before committing, run `npm run lint && npm test && npm run build && npm run e2e`.

## Scripts

| Command              | What it does                                       |
| -------------------- | -------------------------------------------------- |
| `npm run dev`        | Start the Vite dev server                          |
| `npm run build`      | Type-check and build the static site into `dist/`  |
| `npm run preview`    | Serve the production build                         |
| `npm test`           | Unit tests (Vitest), single run                    |
| `npm run test:watch` | Unit tests in watch mode                           |
| `npm run e2e`        | End-to-end browser tests (Playwright)              |
| `npm run lint`       | ESLint                                             |
| `npm run format`     | Prettier                                           |

## Project layout

```
src/
  model/      Zod schema (show file format), presets, cue addressing, demo show
  engine/     Pure functions: timing, totals, cost, validation, cue list, worksheet chains
  store/      Zustand store (autosave + undo/redo) and all show mutations
  features/   inventory, site map, positions (React Flow + rack editor), firing system,
              timeline, reports (print views, exports, show mode), settings
  components/ Small UI kit
e2e/          Playwright tests
```
