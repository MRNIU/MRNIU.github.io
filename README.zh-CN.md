# GitPulse

> 一个全自动、AI 驱动的开源开发者个人主页模板。
> 抓取你所有的 GitHub 公开活动，以高密度时间线展示在 `<username>.github.io`。

**在线演示：** [mrniu.github.io](https://mrniu.github.io) | **[English](./README.md)**

---

## 如何使用

1. 点击本仓库顶部绿色 **"Use this template"** 按钮 → **"Create a new repository"**
2. 仓库名填 **`<你的用户名>.github.io`**
3. 编辑 `devlog.config.cjs` — 把 `username` 改成你的：
   ```javascript
   module.exports = {
     username: "你的GitHub用户名",  // ← 改成你的
     locale: "zh-CN",  // "en" 或 "zh-CN"
   };
   ```
4. 在仓库 **Settings** 中启用：
   - **Actions → General → Workflow permissions** → 选择 **"Read and write permissions"**
   - **Pages → Build and deployment → Source** → 选择 **"GitHub Actions"**
5. **（可选）** AI 吐槽默认通过 **GitHub Copilot** 开箱即用（免费 `gpt-4o-mini`）。
   无需额外配置密钥 — 默认使用仓库的 `GITHUB_TOKEN`。
   如需使用其他 LLM 服务商，在 **Settings → Secrets and variables → Actions** 中设置：
   - 密钥 `LLM_API_KEY` — 任意 OpenAI 兼容的 API key
   - 变量 `LLM_BASE_URL` — 服务商接口地址（默认：GitHub Models）
   - 变量 `LLM_MODEL` — 模型名称（默认：`gpt-4o-mini`）
6. 前往 **Actions** 标签 → **"GitPulse Data Fetch"** → **"Run workflow"**
7. 完成 — 几分钟内你的网站就在 `https://<你的用户名>.github.io` 上线了

> **说明：** 模板自带演示数据。首次运行时，抓取脚本会自动检测用户名不匹配并清空旧数据，然后抓取你自己的数据。所有数据都会提交到你的仓库中，方便随时查看。

---

## 功能特性

- **全方位活动追踪** — 跨所有公开仓库的提交、PR、代码审查、Issue 和评论
- **无限滚动时间线** — 滚动时自动加载所有月份，侧边栏随滚动位置同步高亮
- **渐进式回填** — 多次运行自动抓取完整历史，遵守 API 速率限制
- **AI 每周吐槽** — LLM 生成的每周开发模式点评（自动回补历史周数据）
- **可缩放热力图** — SVG 贡献图自动填充容器宽度
- **Cyber-Primer 设计** — 终端美学暗色主题，`clamp()` 流式字体适配手机到 4K
- **零服务器成本** — 仅需 GitHub Actions + GitHub Pages
- **国际化** — 内置英文和简体中文

## 配置项

`devlog.config.cjs` 中的所有选项：

| 选项 | 默认值 | 描述 |
|---|---|---|
| `username` | — | GitHub 用户名（必填） |
| `locale` | `"en"` | `"en"` 或 `"zh-CN"` |
| `scope` | `"all"` | `"all"` 追踪全部，`"specific"` 仅追踪指定仓库 |
| `targetRepos` | `[]` | scope 为 `"specific"` 时追踪的仓库列表 |
| `ignoredRepos` | `[]` | 始终排除的仓库列表 |
| `filters.ignoreKeywords` | `["wip", "typo", ...]` | 包含这些关键词的提交将被过滤 |
| `filters.ignoreShortComments` | `true` | 过滤 "LGTM"、"+1" 等短评论 |
| `aiRoast.enabled` | `true` | 启用 AI 点评 |
| `aiRoast.promptMode` | `"toxic_senior_dev"` | `"toxic_senior_dev"`、`"encouraging_mentor"` 或 `"custom"` |
| `llm.baseUrl` | `"https://models.inference.ai.azure.com/v1"` | 任意 OpenAI 兼容接口地址（默认：GitHub Models） |
| `llm.model` | `"gpt-4o-mini"` | 模型名称 |

环境变量 `LLM_BASE_URL` 和 `LLM_MODEL` 会覆盖配置文件中的值。

## 架构

```
GitHub Actions（每日定时任务）
  │
  ├── 数据抓取：GitHub GraphQL API → data/*.json（按月分片）
  ├── AI 评论：LLM API → ai_roast 事件（自动回补历史）
  ├── 提交：data/ 目录推送回仓库
  └── 部署：触发 Astro 构建 → GitHub Pages
```

- **数据** — 增量更新 + 渐进式回填，带断点续传。5xx 错误自动指数退避重试。检测到用户名变更时自动清空旧数据（模板使用场景）。
- **AI 吐槽** — 扫描所有历史数据，为缺少吐槽的周自动生成。随时启用都安全。
- **前端** — Astro 静态生成，Cyber-Primer 设计系统，IntersectionObserver 无限滚动
- **存储** — JSON 文件提交到仓库，作为静态资源提供

## 自定义域名

在仓库 Settings → Pages → Custom domain 中配置。参见 [GitHub 文档](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)。

## 本地开发

```bash
npm install
npm run dev        # Astro 开发服务器
npm run build      # 生产构建
npm test           # 运行测试
npm run fetch      # 抓取数据（需要 GITHUB_TOKEN）
```

## 许可证

[GPL-3.0](LICENSE)
