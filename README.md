# GitPulse

> A fully automated, AI-powered personal homepage template for active open-source developers.
> Fetches your entire public GitHub activity and displays it as a high-density timeline on `<username>.github.io`.

**Live demo:** [mrniu.github.io](https://mrniu.github.io) | **[中文文档](./README.zh-CN.md)**

---

## Use This Template

1. Click the green **"Use this template"** button at the top of this repo → **"Create a new repository"**
2. Name the new repo **`<your-username>.github.io`**
3. Edit `devlog.config.cjs` — change `username` to yours:
   ```javascript
   module.exports = {
     username: "your-github-username",  // ← change this
     locale: "en",  // "en" or "zh-CN"
   };
   ```
4. In repo **Settings**, enable:
   - **Actions → General → Workflow permissions** → **"Read and write permissions"**
   - **Pages → Build and deployment → Source** → **"GitHub Actions"**
5. *(Optional)* AI Roast works out of the box via **GitHub Copilot** (free `gpt-4o-mini`).
   No extra secrets needed — it uses your repo's `GITHUB_TOKEN` by default.
   To use a different LLM provider, set in **Settings → Secrets and variables → Actions**:
   - Secret `LLM_API_KEY` — any OpenAI-compatible key
   - Variable `LLM_BASE_URL` — provider endpoint (default: GitHub Models)
   - Variable `LLM_MODEL` — model name (default: `gpt-4o-mini`)
6. Go to **Actions** tab → **"GitPulse Data Fetch"** → **"Run workflow"**
7. Done — site live at `https://<your-username>.github.io` in minutes

> **Note:** The template includes demo data. On first run, the fetch script auto-detects the username mismatch and clears the old data before fetching yours. All data is committed to your repo for easy review.

---

## Features

- **Full-spectrum activity tracking** — Commits, PRs, code reviews, issues, and comments across all public repos
- **Infinite scroll timeline** — Months load seamlessly as you scroll, sidebar syncs to current position
- **Progressive backfill** — Fetches complete history over multiple runs, respecting API rate limits
- **AI Weekly Roast** — LLM-generated commentary on weekly patterns (auto-backfills historical weeks)
- **Scalable heatmap** — SVG contribution graph that fills its container
- **Cyber-Primer design** — Terminal-aesthetic dark theme, fluid `clamp()` typography from mobile to 4K
- **Zero server cost** — GitHub Actions + GitHub Pages only
- **i18n** — English and Simplified Chinese included

## Configuration

All options in `devlog.config.cjs`:

| Option | Default | Description |
|---|---|---|
| `username` | — | GitHub username (required) |
| `locale` | `"en"` | `"en"` or `"zh-CN"` |
| `scope` | `"all"` | `"all"` or `"specific"` (use targetRepos) |
| `targetRepos` | `[]` | Repos to track when scope is `"specific"` |
| `ignoredRepos` | `[]` | Repos to exclude |
| `filters.ignoreKeywords` | `["wip", "typo", ...]` | Filter commits by message keywords |
| `filters.ignoreShortComments` | `true` | Filter "LGTM", "+1", etc. |
| `aiRoast.enabled` | `true` | Enable AI commentary |
| `aiRoast.promptMode` | `"toxic_senior_dev"` | `"toxic_senior_dev"`, `"encouraging_mentor"`, or `"custom"` |
| `llm.baseUrl` | `"https://models.inference.ai.azure.com/v1"` | Any OpenAI-compatible endpoint (default: GitHub Models) |
| `llm.model` | `"gpt-4o-mini"` | Model name |

`LLM_BASE_URL` and `LLM_MODEL` env vars override config values.

## Architecture

```
GitHub Actions (daily cron)
  │
  ├── Fetch: GitHub GraphQL API → data/*.json (monthly shards)
  ├── AI: LLM API → ai_roast events (auto-backfills)
  ├── Commit: data/ pushed to repo
  └── Deploy: triggers Astro build → GitHub Pages
```

- **Data** — Incremental + progressive backfill with checkpoint. Retries 5xx with exponential backoff. Auto-clears on username change (template usage).
- **AI Roast** — Scans all history for weeks missing roasts. Safe to enable anytime.
- **Frontend** — Astro SSG, Cyber-Primer design system, IntersectionObserver infinite scroll
- **Storage** — JSON committed to repo, served as static assets

## Custom Domain

Settings → Pages → Custom domain. See [GitHub docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

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
