# GitPulse

> 一个全自动、AI 驱动的开源开发者个人主页模板。
> 抓取你所有的 GitHub 公开活动，以高密度时间线展示在 `<username>.github.io`。

**在线演示：** [mrniu.github.io](https://mrniu.github.io)

**[English](./README.md)**

---

## 功能特性

- **全方位活动追踪** — 跨所有公开仓库的提交、PR、代码审查、Issue 和评论
- **无限滚动时间线** — 滚动时自动加载所有月份，侧边栏月份指示器随滚动位置同步高亮
- **渐进式回填** — 多次运行自动抓取完整历史，遵守 API 速率限制
- **AI 每周吐槽** — 可选的 LLM 生成的每周开发模式趣味点评（自动回补历史周数据）
- **GitHub 风格热力图** — 可缩放的 SVG 贡献图
- **Cyber-Primer 设计** — 终端美学暗色主题，高密度布局，演示级流式字体
- **零服务器成本** — 完全运行在 GitHub Actions + GitHub Pages 上
- **国际化支持** — 内置英文和简体中文，可扩展

## 快速开始

1. **使用此模板** — 点击 **"Use this template"** → **"Create a new repository"**，命名为 `<你的用户名>.github.io`

2. **配置** — 编辑 `devlog.config.cjs`：
   ```javascript
   module.exports = {
     username: "你的GitHub用户名",  // ← 改成你的用户名
     locale: "zh-CN",  // "en" 或 "zh-CN"
   };
   ```

3. **启用权限** — 在仓库 **Settings** 中：
   - **Actions → General → Workflow permissions** → 选择 **"Read and write permissions"**
   - **Pages → Build and deployment → Source** → 选择 **"GitHub Actions"**

4. **启用 AI 吐槽（可选）** — 前往 **Settings → Secrets and variables → Actions**：
   - 添加密钥 `LLM_API_KEY`（你的 API key）
   - 可选设置变量 `LLM_BASE_URL` 和 `LLM_MODEL`（默认使用 OpenAI gpt-4o）

5. **运行数据抓取** — **Actions** 标签 → **"GitPulse Data Fetch"** → **"Run workflow"**

6. **完成** — 几分钟内你的网站将在 `https://<你的用户名>.github.io` 上线，每日定时任务自动保持更新。

## 配置项

`devlog.config.cjs` 中的所有选项：

| 选项 | 默认值 | 描述 |
|---|---|---|
| `username` | — | 你的 GitHub 用户名（必填） |
| `locale` | `"en"` | 界面语言：`"en"` 或 `"zh-CN"` |
| `scope` | `"all"` | `"all"` 追踪全部，`"specific"` 仅追踪指定仓库 |
| `targetRepos` | `[]` | scope 为 `"specific"` 时追踪的仓库列表 |
| `ignoredRepos` | `[]` | 始终排除的仓库列表 |
| `filters.ignoreKeywords` | `["wip", "typo", ...]` | 包含这些关键词的提交将被过滤 |
| `filters.ignoreShortComments` | `true` | 过滤 "LGTM"、"+1" 等短评论 |
| `aiRoast.enabled` | `true` | 启用 AI 点评 |
| `aiRoast.promptMode` | `"toxic_senior_dev"` | 提示词模式：`"toxic_senior_dev"`、`"encouraging_mentor"` 或 `"custom"` |
| `llm.baseUrl` | `"https://api.openai.com/v1"` | 任意 OpenAI 兼容接口地址 |
| `llm.model` | `"gpt-4o"` | 模型名称 |

环境变量 `LLM_BASE_URL` 和 `LLM_MODEL` 会覆盖配置文件中的值。

## 架构

```
GitHub Actions（每日定时任务）
  │
  ├── 数据抓取：GitHub GraphQL API → data/*.json（按月分片）
  ├── AI 评论：LLM API → ai_roast 事件（可选，自动回补历史）
  ├── 提交：data/ 目录推送回仓库
  └── 部署：触发 Astro 构建 → GitHub Pages
```

- **数据抓取** — 增量更新 + 渐进式回填，带断点续传，遵守 5000 点/小时速率限制。遇到 5xx 错误自动指数退避重试。
- **AI 吐槽** — 扫描所有历史数据，为缺少吐槽的周自动生成。随时启用都安全，不会重复生成。
- **前端** — Astro 静态生成，Cyber-Primer 设计系统，`clamp()` 流式字体，IntersectionObserver 无限滚动
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
