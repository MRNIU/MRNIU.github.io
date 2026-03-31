# GitPulse

> A fully automated, AI-powered personal homepage template for active open-source developers.
> Fetches your entire public GitHub activity and displays it as a high-density timeline on `<username>.github.io`.

## Features

- **Full-spectrum activity tracking** — Commits, PRs, code reviews, issues, and comments across all public repos
- **Progressive backfill** — Automatically fetches your complete history over multiple runs, respecting API rate limits
- **AI Weekly Roast** — Optional LLM-generated witty commentary on your weekly development patterns
- **GitHub-native heatmap** — SVG contribution graph with Primer Design System theming
- **Light/Dark mode** — Follows system preference, powered by GitHub Primer CSS
- **Zero server cost** — Runs entirely on GitHub Actions + GitHub Pages
- **i18n ready** — English and Simplified Chinese included, extensible

## Quick Start

1. **Use this template** — Click "Use this template" to create `<your-username>.github.io`

2. **Configure** — Edit `devlog.config.cjs`:
   ```javascript
   module.exports = {
     username: "your-github-username",
     locale: "en",  // "en" or "zh-CN"
     // ... see file for all options
   };
   ```

3. **Enable permissions** — In your repo Settings:
   - Actions → General → Workflow permissions → **"Read and write permissions"**
   - Pages → Build and deployment → Source → **"GitHub Actions"**

4. **Enable AI (optional)** — Add `LLM_API_KEY` to repo Secrets (Settings → Secrets → Actions)

5. **Run** — Go to Actions tab → "GitPulse Data Fetch" → "Run workflow"

6. **Done** — Your site is live at `https://<your-username>.github.io`. Data backfills automatically on subsequent runs.

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
  ├── AI: LLM API → ai_roast events (optional)
  └── Deploy: Astro build → GitHub Pages
```

- **Data fetching** — Incremental updates + progressive backfill, respecting 5000 pts/hr rate limit
- **Frontend** — Astro SSG with Primer CSS, CountUp animations, SVG heatmap
- **Storage** — JSON files committed to the repo, served as static assets

## Custom Domain

To use a custom domain, configure it in repo Settings → Pages → Custom domain. See [GitHub docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

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
