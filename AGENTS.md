# AGENTS.md

## Project Snapshot

- This repository is `GitPulse`, an Astro static site for GitHub Pages.
- Frontend code lives in `src/`; data-fetching and JSON writing code lives in `scripts/src/`; tracked activity data lives in `data/`.
- `src/integrations/copy-data.ts` copies `data/*.json` into `public/data/` during `astro build`, excluding `data/checkpoint.json`.
- `devlog.config.cjs` is the runtime configuration source for the site and fetch script.
- The source-of-truth tooling files are `package.json`, `package-lock.json`, `.github/workflows/*.yml`, `astro.config.mjs`, and `vitest.config.ts`.

## Tooling And Commands

- Prefer repository-documented entrypoints. Current CI uses Node 22 with `npm ci`.
- Keep `package-lock.json` in sync with dependency changes. Do not use `npm install` just to verify existing code.
- Do not commit `node_modules/`, `dist/`, `.astro/`, or local `.env*` files.
- Common commands:
  - `npm ci` - install exactly from the lockfile.
  - `npm run dev` - run the Astro dev server.
  - `npm run build` - build the static site and copy `data/*.json` into `public/data/`.
  - `npm test` - run the Vitest suite under `scripts/__tests__`.
  - `npm run fetch` - fetch GitHub activity data. This requires `GITHUB_TOKEN` and mutates `data/`.

## Verification Policy

- For frontend, layout, Astro component, integration, i18n, or stylesheet changes, run `npm run build` when dependencies are available.
- For fetch pipeline, data writer, GraphQL client, config, filter, rate-limit, AI roast, or type changes, run `npm test`; use targeted Vitest files first when the change is narrow.
- Do not run `npm run fetch` unless the task explicitly asks to update fetched data or validate the live data pipeline. It changes tracked JSON and checkpoint state.
- If dependencies are absent locally, do not silently install global tools or host toolchains. State what could not be verified, or use an existing documented/containerized environment if one is provided.

## Code Boundaries

- `scripts/src/types.ts` defines the event, index, monthly shard, checkpoint, and GraphQL shared types. Update it before changing event shape elsewhere.
- Fetchers in `scripts/src/fetchers/` should return `GitPulseEvent[]` plus pagination state; keep orchestration in `scripts/src/fetch-data.ts`.
- `scripts/src/data-writer.ts` owns deduplication, monthly shard writing, and rebuilding `data/index.json`.
- `scripts/src/checkpoint.ts` owns checkpoint defaults and serialization.
- `src/pages/index.astro` renders the first month at build time and loads later months from `/data/YYYY-MM.json` in the browser.
- Keep locale strings in `src/i18n/en.json` and `src/i18n/zh-CN.json` synchronized when adding user-facing text.

## Data And Generated Files

- Treat `data/*.json` as tracked source data for the published site. Avoid hand-editing data except for explicit corrections.
- Treat `public/data/*.json` as a generated mirror used by GitHub Pages. Prefer changing `data/` and rebuilding instead of editing `public/data/` directly.
- `data/checkpoint.json` is fetcher state, not public site data. It must not be copied to `public/data/`.
- Preserve event IDs and timestamps when transforming data; the writer deduplicates by `id` and sorts monthly events descending by `ts`.

## Documentation

- `README.md` and `README.zh-CN.md` are template-user documentation. Keep them short, practical, and in sync when behavior changes.
- `design.md` is the concise current architecture note. Do not expand it into a step-by-step implementation plan.
- Avoid reintroducing completed historical plan files under `docs/superpowers/plans/`; stale agent plans can conflict with the implemented code.

## Git And Publication Hygiene

- Commit messages, PR text, release notes, and upstream-facing docs should mention repository-visible changes, reviewer-relevant rationale, and verification only.
- Do not publish local paths, local container names, scratch paths, private plan names, or one-off local workflow details.
- When editing generated or data-heavy files, stage only files relevant to the task.
