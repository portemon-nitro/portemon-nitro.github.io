# portemon-nitro.github.io

Landing page for the Portémon Nitro project.

The site is dependency-free at runtime: GitHub Pages serves the checked-in
HTML, CSS, JavaScript, and media files directly. npm is used only for development tooling.

## Development

Requires a current Node.js release.

```bash
npm install
npm run dev
```

Then open <http://127.0.0.1:4173>.

## Checks

```bash
npm run check
```

Use `npm run fix` to apply Biome's safe formatting and lint fixes.

## Deployment

There is no build step. Configure GitHub Pages to deploy from the repository's `main`
branch/root directory. Changes to static files are the deployable artifact.
