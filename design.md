# GitPulse Design Notes

This file records the current architecture and maintenance boundaries for GitPulse. It is intentionally concise; the executable truth is still in `package.json`, `.github/workflows/`, `devlog.config.cjs`, and the source code.

## Product Shape

GitPulse is an automated GitHub Pages homepage for active open-source developers. It fetches public GitHub activity, stores it as tracked JSON shards, and renders a high-density Astro timeline with dashboard statistics, a heatmap, repository summaries, filters, and optional AI weekly commentary.

The current repository is configured for user `MRNIU` in `devlog.config.cjs`.

## Runtime Architecture

```
GitHub Actions
  |
  |-- fetch-data.yml
  |     npm ci
  |     npm run fetch
  |     commit updated data/
  |     trigger deploy.yml when data changed
  |
  |-- deploy.yml
        npm ci
        npm run build
        upload dist/ to GitHub Pages
```

The fetch pipeline runs in Node 22 in CI. The site is built with Astro and deployed as static files. No backend server is required after deployment.

## Source Map

- `devlog.config.cjs` - username, locale, repository scope, filters, AI roast, LLM, and schedule settings.
- `scripts/src/fetch-data.ts` - pipeline orchestrator for incremental fetch, backfill, filtering, AI roast generation, data writes, and checkpoint updates.
- `scripts/src/fetchers/` - GraphQL fetchers for commits, pull requests, issues, comments, and reviews.
- `scripts/src/graphql-client.ts` - GitHub GraphQL request wrapper with rate-limit injection and retry behavior.
- `scripts/src/rate-limit.ts` - remaining-budget tracker and continuation threshold.
- `scripts/src/data-writer.ts` - monthly shard merge, event deduplication, sorting, and `data/index.json` generation.
- `scripts/src/types.ts` - shared event, index, shard, checkpoint, and GraphQL types.
- `src/pages/index.astro` - server-rendered first month plus client-side infinite scroll for later months.
- `src/components/` - dashboard, heatmap, sidebar, event cards, and event-specific node renderers.
- `src/styles/` - Cyber-Primer visual system and timeline layout.
- `src/i18n/` - English and Simplified Chinese strings.
- `src/integrations/copy-data.ts` - build-time copy from `data/` to `public/data/`.

## Data Contract

`data/index.json` contains global stats and month summaries. `data/YYYY-MM.json` contains events for that month, sorted newest first.

Supported event types are:

- `commit`
- `pull_request`
- `review`
- `issue`
- `issue_comment`
- `ai_roast`

Each event has a stable `id`, ISO timestamp `ts`, optional `repo`, optional semantic tag, and event-specific `data`. Schema changes should start in `scripts/src/types.ts`, then update fetchers, writer logic, renderers, tests, and any existing data migration needs.

## Fetch And Backfill Model

The pipeline prioritizes new activity first, then uses remaining GitHub API budget for historical backfill. Checkpoint state in `data/checkpoint.json` records cursors and progress for each stream. The rate-limit threshold is intentionally conservative so a run can stop cleanly and resume later.

AI roast generation scans historical non-roast events and fills missing weekly roast entries when enabled. It uses `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL` environment overrides when present.

## Frontend Model

The first month is rendered at build time from `data/index.json` and the corresponding monthly shard. Later months are fetched from `/data/YYYY-MM.json` as the user scrolls. The sidebar filter state is applied both to initial markup and dynamically loaded event cards.

When adding new event types, update both the Astro component rendering path and the browser-side `renderEventCard` helper used for infinite-scroll content.

## Maintenance Boundaries

- Keep README files focused on template usage, configuration, deployment, and basic development commands.
- Keep this file focused on current architecture and behavioral contracts.
- Do not keep long completed implementation plans in the repository unless they contain still-actionable decisions that cannot be captured here.
- Avoid editing generated public mirrors directly; update `data/` and rebuild instead.
