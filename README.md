# GitPulse

> A fully automated, AI-powered personal homepage template for active open-source developers.
> Fetches your entire public GitHub activity and displays it as a high-density timeline on `<username>.github.io`.
>
> 一个全自动、AI 驱动的开源开发者个人主页模板。
> 抓取你所有的 GitHub 公开活动，以高密度时间线展示在 `<username>.github.io`。

**Live demo / 在线演示:** [mrniu.github.io](https://mrniu.github.io)

---

## Features / 功能特性

- **Full-spectrum activity tracking / 全方位活动追踪** — Commits, PRs, code reviews, issues, and comments across all public repos / 跨所有公开仓库的提交、PR、代码审查、Issue 和评论
- **Infinite scroll timeline / 无限滚动时间线** — All months load seamlessly as you scroll, with sidebar month indicator synced to scroll position / 滚动时自动加载所有月份，侧边栏月份指示器随滚动位置同步高亮
- **Progressive backfill / 渐进式回填** — Automatically fetches your complete history over multiple runs, respecting API rate limits / 多次运行自动抓取完整历史，遵守 API 速率限制
- **AI Weekly Roast / AI 每周吐槽** — Optional LLM-generated witty commentary on your weekly development patterns / 可选的 LLM 生成的每周开发模式趣味点评
- **GitHub-native heatmap / GitHub 风格热力图** — SVG contribution graph with Primer Design System theming / 使用 Primer 设计系统主题的 SVG 贡献图
- **Light/Dark mode / 明暗主题** — Follows system preference, powered by GitHub Primer CSS / 跟随系统偏好，基于 GitHub Primer CSS
- **Zero server cost / 零服务器成本** — Runs entirely on GitHub Actions + GitHub Pages / 完全运行在 GitHub Actions + GitHub Pages 上
- **i18n ready / 国际化支持** — English and Simplified Chinese included, extensible / 内置英文和简体中文，可扩展

---

## Quick Start / 快速开始

1. **Fork or use this template / 复刻或使用此模板** — Click **"Use this template"** → **"Create a new repository"**, and name it `<your-username>.github.io` / 点击 **"Use this template"** → **"Create a new repository"**，命名为 `<your-username>.github.io`

2. **Configure / 配置** — Edit `devlog.config.cjs` in the new repo / 编辑新仓库中的 `devlog.config.cjs`：
   ```javascript
   module.exports = {
     username: "your-github-username",  // ← change this / 改成你的用户名
     locale: "en",  // "en" or "zh-CN"
     // ... see file for all options / 查看文件了解所有选项
   };
   ```

3. **Enable permissions / 启用权限** — In your repo **Settings** / 在仓库 **Settings** 中：
   - **Actions → General → Workflow permissions** → select **"Read and write permissions"** / 选择 **"Read and write permissions"**
   - **Pages → Build and deployment → Source** → select **"GitHub Actions"** / 选择 **"GitHub Actions"**

4. **Enable AI Roast (optional) / 启用 AI 吐槽（可选）** — Go to **Settings → Secrets and variables → Actions** / 前往 **Settings → Secrets and variables → Actions**：
   - Add secret `LLM_API_KEY` with your API key / 添加密钥 `LLM_API_KEY`
   - Optionally set variables `LLM_BASE_URL` and `LLM_MODEL` (defaults to OpenAI gpt-4o) / 可选设置变量 `LLM_BASE_URL` 和 `LLM_MODEL`（默认使用 OpenAI gpt-4o）

5. **Run the data fetch / 运行数据抓取** — Go to **Actions** tab → **"GitPulse Data Fetch"** → **"Run workflow"** / 前往 **Actions** 标签 → **"GitPulse Data Fetch"** → **"Run workflow"**

6. **Done / 完成** — Your site will be live at `https://<your-username>.github.io` within minutes. The daily cron job keeps it updated automatically. / 几分钟内你的网站将在 `https://<your-username>.github.io` 上线，每日定时任务自动保持更新。

---

## Configuration / 配置项

All options in `devlog.config.cjs` / `devlog.config.cjs` 中的所有选项：

| Option / 选项 | Default / 默认值 | Description / 描述 |
|---|---|---|
| `username` | — | Your GitHub username (required) / 你的 GitHub 用户名（必填） |
| `locale` | `"en"` | UI language: `"en"` or `"zh-CN"` / 界面语言 |
| `scope` | `"all"` | `"all"` for everything, `"specific"` for targetRepos only / `"all"` 追踪全部，`"specific"` 仅追踪指定仓库 |
| `targetRepos` | `[]` | Repos to track when scope is `"specific"` / scope 为 `"specific"` 时追踪的仓库 |
| `ignoredRepos` | `[]` | Repos to always exclude / 始终排除的仓库 |
| `filters.ignoreKeywords` | `["wip", "typo", ...]` | Commit messages containing these are filtered / 包含这些关键词的提交将被过滤 |
| `filters.ignoreShortComments` | `true` | Filter "LGTM", "+1", etc. / 过滤 "LGTM"、"+1" 等短评论 |
| `aiRoast.enabled` | `true` | Enable AI commentary / 启用 AI 点评 |
| `aiRoast.promptMode` | `"toxic_senior_dev"` | `"toxic_senior_dev"`, `"encouraging_mentor"`, or `"custom"` / 提示词模式 |
| `llm.baseUrl` | `"https://api.openai.com/v1"` | Any OpenAI-compatible endpoint / 任意 OpenAI 兼容接口 |
| `llm.model` | `"gpt-4o"` | Model name / 模型名称 |

Environment variables `LLM_BASE_URL` and `LLM_MODEL` override config values. / 环境变量 `LLM_BASE_URL` 和 `LLM_MODEL` 会覆盖配置值。

---

## Architecture / 架构

```
GitHub Actions (daily cron / 每日定时任务)
  │
  ├── Fetch / 抓取: GitHub GraphQL API → data/*.json (monthly shards / 按月分片)
  ├── AI: LLM API → ai_roast events (optional / 可选)
  └── Deploy / 部署: Astro build → GitHub Pages
```

- **Data fetching / 数据抓取** — Incremental updates + progressive backfill, respecting 5000 pts/hr rate limit / 增量更新 + 渐进式回填，遵守 5000 点/小时速率限制
- **Frontend / 前端** — Astro SSG with Primer CSS, CountUp animations, SVG heatmap / Astro 静态生成，Primer CSS，数字动画，SVG 热力图
- **Storage / 存储** — JSON files committed to the repo, served as static assets / JSON 文件提交到仓库，作为静态资源提供

---

## Custom Domain / 自定义域名

To use a custom domain, configure it in repo Settings → Pages → Custom domain. See [GitHub docs](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

使用自定义域名请在仓库 Settings → Pages → Custom domain 中配置。参见 [GitHub 文档](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)。

---

## Development / 本地开发

```bash
npm install
npm run dev        # Astro dev server / Astro 开发服务器
npm run build      # Production build / 生产构建
npm test           # Run tests / 运行测试
npm run fetch      # Fetch data (requires GITHUB_TOKEN) / 抓取数据（需要 GITHUB_TOKEN）
```

---

## License / 许可证

[GPL-3.0](LICENSE)
