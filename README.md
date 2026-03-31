# GitPulse

> A fully automated, AI-powered personal homepage template for active open-source developers.
> Fetches your entire public GitHub activity and displays it as a high-density timeline on `<username>.github.io`.

**Live demo:** [mrniu.github.io](https://mrniu.github.io)

**[中文文档](./README.zh-CN.md)**

---

## Features

- **Full-spectrum activity tracking** — Commits, PRs, code reviews, issues, and comments across all public repos
- **Infinite scroll timeline** — All months load seamlessly as you scroll, with sidebar month indicator synced to scroll position
- **Progressive backfill** — Automatically fetches your complete history over multiple runs, respecting API rate limits
- **AI Weekly Roast** — Optional LLM-generated witty commentary on your weekly development patterns (auto-backfills historical weeks)
- **GitHub-native heatmap** — Scalable SVG contribution graph
- **Cyber-Primer design** — Terminal-aesthetic dark theme with high-density layout and presentation-scale fluid typography
- **Zero server cost** — Runs entirely on GitHub Actions + GitHub Pages
- **i18n ready** — English and Simplified Chinese included, extensible

## Quick Start

1. **Use this template** — Click **"Use this template"** → **"Create a new repository"**, name it `<your-username>.github.io`

2. **Configure** — Edit `devlog.config.cjs`:
   ```javascript
   module.exports = {
     username: "your-github-username",  // ← change this
     locale: "en",  // "en" or "zh-CN"
   };
   ```

3. **Enable permissions** — In repo **Settings**:
   - **Actions → General → Workflow permissions** → **"Read and write permissions"**
   - **Pages → Build and deployment → Source** → **"GitHub Actions"**

4. **Enable AI Roast (optional)** — **Settings → Secrets and variables → Actions**:
   - Add secret `LLM_API_KEY` with your API key
   - Optionally set variables `LLM_BASE_URL` and `LLM_MODEL` (defaults to OpenAI gpt-4o)

5. **Run** — **Actions** tab → **"GitPulse Data Fetch"** → **"Run workflow"**

6. **Done** — Site live at `https://<your-username>.github.io` within minutes. Daily cron keeps it updated.

## Configuration

All options in `devlog.config.cjs`:

| Option | Default | Description |
|---|---|---|
| `username` | — | Your GitHub username (required) |
| `locale` | `"en"` | UI language: `"en"` or `"zh-CN"` |
| `scope` | `"all"` | `"all"` for everything, `"specific"` for targetRepos only |
| `targetRepos` | `[]` | Repos to track when scope is `"specific"` |
| `ignoredRepos` | `[]` | Repos to always exclude |
| `filters.ignoreKeywords` | `["wip", "typo", ...]` | Commit messages containing these are filtered |
| `filters.ignoreShortComments` | `true` | Filter "LGTM", "+1", etc. |
| `aiRoast.enabled` | `true` | Enable AI commentary |
| `aiRoast.promptMode` | `"toxic_senior_dev"` | `"toxic_senior_dev"`, `"encouraging_mentor"`, or `"custom"` |
| `llm.baseUrl` | `"https://api.openai.com/v1"` | Any OpenAI-compatible endpoint |
| `llm.model` | `"gpt-4o"` | Model name |

Environment variables `LLM_BASE_URL` and `LLM_MODEL` override config values.

## Architecture

```
GitHub Actions (daily cron)
  │
  ├── Fetch: GitHub GraphQL API → data/*.json (monthly shards)
  ├── AI: LLM API → ai_roast events (optional, auto-backfills)
  ├── Commit: data/ pushed to repo
  └── Deploy: triggers Astro build → GitHub Pages
```

- **Data fetching** — Incremental updates + progressive backfill with checkpoint, respecting 5000 pts/hr rate limit. Retries on 5xx errors with exponential backoff.
- **AI Roast** — Scans all historical data for weeks missing roasts and generates them. Safe to enable at any time — no duplicate generation.
- **Frontend** — Astro SSG, Cyber-Primer design system, fluid `clamp()` typography, infinite scroll with IntersectionObserver
- **Storage** — JSON files committed to the repo, served as static assets

## Custom Domain

Configure in repo Settings → Pages → Custom domain. See [GitHub docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

## Development

```bash
npm install
npm run dev        # Astro dev server
npm run build      # Production build
npm test           # Run tests
npm run fetch      # Fetch data (requires GITHUB_TOKEN)
```

## License

[GPL-3.0](LICENSE)
