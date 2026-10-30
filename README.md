# Jigsaw

A calm, easy-to-handle jigsaw puzzle, built to be played on an iPad in
Safari. Large buttons, big text, forgiving touch and no time pressure.

- **Pick a picture** from three suggestions, or tap **Show me different
  pictures** for three more. **Use one of my photos** opens the photo library.
- **Pick how many pieces**: 25, 50 or 100, or **Other** for any number
  from 4 to 300. The preview shows where the cuts will be.
- **Play**: drag pieces from the tray at the side (or bottom, when the iPad
  is upright) onto the table. Use the arrow buttons to see more of the tray.
  Pieces never need turning.
  - Pieces click into place when dropped roughly near the right spot, and
    click onto matching neighbours anywhere on the table; joined pieces move
    together. Pieces in their right place are fixed so they can't be knocked.
  - Tapping close to a piece picks it up, even if the finger misses slightly.
  - Drop a single piece back on the tray to put it away.
- **Helpers** in the toolbar:
  - **Big picture** shows the whole picture with its credits.
  - **Faint picture** shows a faint copy of the picture on the board.
  - **Edge pieces** shows only edge pieces in the tray.
  - **Sound** turns the gentle clicks on or off.

The puzzle in progress, its picture and the settings are kept in the
browser's local storage, so the app reopens where you left off, even after
a reload or a restart. The **Pictures** button goes back to the menu, where
**Carry on with your puzzle** picks it up again.

To install on an iPad: open the site in Safari → Share → **Add to Home
Screen**. This works better than a Safari tab: it opens full screen, works
offline once loaded, and Safari won't clear the saved puzzle after a week of
not being used, which it does for websites in ordinary tabs.

## Pictures

Suggestions come live from:

| Source | What | Licence |
| --- | --- | --- |
| [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Featured_pictures) | Featured pictures (photographs) | Public domain, CC0 or CC BY / BY-SA only; credited |
| [Art Institute of Chicago](https://api.artic.edu/docs/) | Public-domain paintings | CC0 |
| [The Met](https://metmuseum.github.io/) | Public-domain works from European Paintings, Asian Art and the American Wing | CC0 |

Each source is searched for gentle themes such as gardens, harbours,
birds and still life (`src/sources.ts`). Pictures are skipped if their
titles mention unwelcome subjects, or if they are too tall or too wide for
a screen. Credits (title, artist, licence and source) appear when you
choose a picture and in **Big picture**.

A source that fails or is unreachable is skipped quietly. If none can be
reached, for example when offline, the app says so and offers your own
photos instead.

The **Check picture sources** workflow calls the real services each week
(and on demand) to catch any changes to their APIs; run the same check
locally with `npm run check-sources`.

## Development

```sh
npm install
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run build        # type-check and build to dist/
npm run test:e2e     # Playwright tests against the built app (sources mocked)
npm run make-icons   # rebuild the PNG icons from public/icons/icon.svg
```

Plain TypeScript and CSS with Vite; no runtime dependencies.

- `src/puzzle.ts`: grid sizing, piece shapes, snapping rules (no DOM).
- `src/board.ts`: the play screen, with table, tray, dragging and helpers.
- `src/app.ts`: menu screens and saving/resuming.
- `src/sources.ts`: picture suggestions; `src/images.ts`: loading and
  shrinking pictures for storage.

## Deployment

`.github/workflows/deploy.yml` publishes to GitHub Pages via the
`gh-pages` branch:

| Trigger | Published at |
| --- | --- |
| push to `main` | site root, e.g. `https://<owner>.github.io/jigsaw/` |
| pull request into `main` | `/stage/`, e.g. `https://<owner>.github.io/jigsaw/stage/` |

The live site and `/stage/` keep separate saved puzzles.

One-time setup: **Settings → Pages → Build and deployment → Source: Deploy
from a branch → `gh-pages` / `(root)`**. The branch is created by the
first workflow run.
