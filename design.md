# GitPulse — 产品设计文档

> 面向高活跃度开源开发者的全自动、AI 驱动个人主页模板。
> 通过 GitHub Actions 自动抓取开发者全域公开活动，以极客风格高密度信息流展示在 `<username>.github.io` 上。

---

## 1. 产品定位

### 1.1 一句话描述

一个 GitHub Pages 模板：Fork 即用，自动拉取你的全部公开开发活动，生成一个让访客感到震撼的个人技术主页。

### 1.2 目标用户

高活跃度的开源开发者 — 有大量跨仓库的 commit、PR、code review、issue 讨论记录，希望以一种有冲击力的方式向外界展示自己的技术足迹。

### 1.3 核心体验目标

- **对访客：** 第一眼被统计数字和活动热力图震撼，向下滚动被密集的真实开发记录淹没。
- **对站长（模板使用者）：** 5 分钟内完成部署，之后完全无人值守，数据自动更新。

---

## 2. 系统架构

采用"静态托管 + GitHub Actions 定时写库"的 Serverless 架构，零服务器成本。

```
┌─────────────────────────────────────────────────────────┐
│                  GitHub Actions (定时触发)                │
│                                                         │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │  Data     │───▶│  Data    │───▶│  LLM API         │   │
│  │  Fetcher  │    │  Writer  │    │  (可选, 用户配置)  │   │
│  └──────────┘    └──────────┘    └──────────────────┘   │
│       │               │                   │             │
│       ▼               ▼                   ▼             │
│  GitHub GraphQL   data/*.json        ai_roast 节点      │
│  API (公开数据)   (按月分片)          (插入 JSON)        │
│                                                         │
│  ──────── git commit + push 至 main ────────────────▶   │
└─────────────────────────────────────────────────────────┘
                          │
                          ▼
              GitHub Pages 自动部署
              https://<username>.github.io
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│                浏览器 (静态前端)                          │
│                                                         │
│  1. 首屏：统计仪表盘 + 活动热力图（震撼入口）            │
│  2. 主体：虚拟滚动时间线信息流                           │
│  3. Fetch data/index.json → 按需加载月度 JSON            │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 数据采集模块

### 3.1 采集策略

- **以用户为中心（User-Centric）：** 通过 GitHub GraphQL API 的 `User` 节点聚合全域公开活动，不逐仓库轮询。
- **仅限公开数据：** 不采集 private repo 活动，使用默认 `GITHUB_TOKEN` 即可完成所有查询。

### 3.2 采集范围

| 数据类型 | GraphQL 来源 | 说明 |
|---|---|---|
| Commit | `contributionsCollection.commitContributionsByRepository` + REST 补全 | SHA、message、additions/deletions |
| Pull Request | `pullRequests(states: [...])` | 标题、状态、body |
| Code Review | `contributionsCollection.pullRequestReviewContributions` | review body + 行内评论 |
| Issue | `issues(states: [...])` | 标题、状态、body |
| Issue Comment | `issueComments` | 跨仓库讨论发言 |

### 3.3 Rate Limit 管理与渐进式回填

GitHub GraphQL API 认证后配额为 **5000 点/小时**。本系统采用"从最近往最早拉，额度用完即停，下次继续"的渐进式回填策略。

#### 状态文件 `data/checkpoint.json`

```json
{
  "lastFetchedAt": "2026-03-30T02:00:00Z",
  "backfill": {
    "completed": false,
    "oldestReached": "2025-10-15T00:00:00Z",
    "cursors": {
      "commits": "Y3Vyc29yOnYyOpK...",
      "pullRequests": "Y3Vyc29yOnYyOpL...",
      "issues": null,
      "issueComments": "Y3Vyc29yOnYyOpM...",
      "reviews": null
    }
  }
}
```

#### 运行流程

```
Action 触发
    │
    ├─ 1. 读取 checkpoint.json
    │
    ├─ 2. 增量阶段：拉取 lastFetchedAt 之后的新数据
    │     （日常运行，消耗少量配额）
    │
    ├─ 3. 检查剩余配额（rateLimit.remaining）
    │     └─ < 500 → 保存 checkpoint，结束
    │
    ├─ 4. 回填阶段：从 oldestReached 继续往更早拉取
    │     ├─ 每批 100 条，用 cursor 翻页
    │     ├─ 每批后检查 remaining
    │     └─ < 500 → 保存 checkpoint，结束
    │
    ├─ 5. 全部历史拉取完毕
    │     └─ 标记 backfill.completed = true
    │
    └─ 6. 将数据写入对应月份 JSON，更新 index.json
         git commit + push
```

**关键设计：**
- 首次运行从"当前时刻"开始向过去拉取，保证最新数据最先上线。
- 每次 Action 运行先处理增量（新数据优先），剩余配额用于回填历史。
- 回填完成后 `backfill.completed = true`，后续运行跳过回填阶段。
- 500 点安全阈值预留给 `git push` 等操作可能触发的 API 调用。

### 3.4 降噪与过滤

通过 `devlog.config.js` 配置：
- **仓库黑名单：** `ignoredRepos` 排除测试仓库等噪音源。
- **关键词过滤：** `ignoreKeywords` 过滤 "typo"、"wip"、"update readme" 等低价值 commit。
- **短评论过滤：** 可选过滤 "LGTM"、"+1" 等无实质内容的评论。

---

## 4. 数据结构

### 4.1 `data/index.json` — 全局索引

```json
{
  "user": "MRNIU",
  "generatedAt": "2026-03-30T02:00:00Z",
  "stats": {
    "totalCommits": 4320,
    "totalPRs": 186,
    "totalReviews": 523,
    "totalIssues": 97,
    "totalComments": 412,
    "activeRepos": 24,
    "earliestEvent": "2019-06-15T00:00:00Z",
    "latestEvent": "2026-03-29T23:45:00Z"
  },
  "months": [
    {
      "key": "2026-03",
      "file": "2026-03.json",
      "eventCount": 342,
      "repos": ["MRNIU/SimpleKernel", "nicklnick/pinux"],
      "breakdown": { "commit": 180, "pull_request": 12, "review": 45, "issue": 8, "issue_comment": 93, "ai_roast": 4 }
    }
  ]
}
```

**设计说明：**
- `stats` 提供全局统计数据，供首屏仪表盘直接使用，无需加载任何月度文件。
- `months` 数组按时间倒序排列（最新在前），每个条目含摘要信息供侧栏导航使用。
- `breakdown` 按事件类型计数，支持前端渲染类型分布图表。

### 4.2 `data/YYYY-MM.json` — 月度事件流

```json
{
  "month": "2026-03",
  "events": [
    {
      "id": "commit-abc1234",
      "type": "commit",
      "ts": "2026-03-29T14:32:00Z",
      "repo": "MRNIU/SimpleKernel",
      "semantic": "feat",
      "data": {
        "sha": "abc1234def5678",
        "message": "feat(mm): implement UEFI memory map parser",
        "additions": 120,
        "deletions": 15
      }
    },
    {
      "id": "pr-5678",
      "type": "pull_request",
      "ts": "2026-03-28T09:00:00Z",
      "repo": "nicklnick/pinux",
      "semantic": "feat",
      "data": {
        "number": 42,
        "title": "Add RISC-V boot support",
        "state": "merged",
        "body": "This PR adds initial RISC-V boot sequence..."
      }
    },
    {
      "id": "review-9012",
      "type": "review",
      "ts": "2026-03-27T16:45:00Z",
      "repo": "rcore-os/rCore",
      "semantic": null,
      "data": {
        "prNumber": 128,
        "prTitle": "Fix page table walk for Sv48",
        "state": "APPROVED",
        "body": "Looks correct. One nit on the TLB flush path...",
        "inlineComments": [
          {
            "path": "kernel/src/mm/page_table.rs",
            "line": 87,
            "body": "This should use `sfence.vma` with ASID to avoid flushing unrelated entries."
          }
        ]
      }
    },
    {
      "id": "issue-3456",
      "type": "issue",
      "ts": "2026-03-26T11:00:00Z",
      "repo": "MRNIU/SimpleKernel",
      "semantic": "fix",
      "data": {
        "number": 99,
        "title": "Boot fails on real hardware with ACPI tables > 4KB",
        "state": "open",
        "body": "When ACPI RSDT spans multiple pages..."
      }
    },
    {
      "id": "comment-7890",
      "type": "issue_comment",
      "ts": "2026-03-25T08:30:00Z",
      "repo": "rust-embedded/rust-raspberrypi-OS-tutorials",
      "semantic": null,
      "data": {
        "issueNumber": 55,
        "issueTitle": "MMU tutorial missing TLB invalidation",
        "body": "I ran into the same issue on RPi4. The fix is to add a DSB after the TLBI..."
      }
    },
    {
      "id": "ai-roast-w13",
      "type": "ai_roast",
      "ts": "2026-03-28T00:00:00Z",
      "repo": null,
      "semantic": null,
      "data": {
        "weekRange": "2026-03-22 ~ 2026-03-28",
        "content": "本周你往 SimpleKernel 提交了 47 次，其中 12 次 message 是 'fix'。就一个字。你是在写操作系统还是在跟编译器玩打地鼠？",
        "stats": { "totalCommits": 47, "topRepo": "MRNIU/SimpleKernel" }
      }
    }
  ]
}
```

**事件通用字段：**

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 全局唯一标识，格式 `{type}-{来源ID}`，前端虚拟滚动用作 key |
| `type` | enum | `commit` \| `pull_request` \| `review` \| `issue` \| `issue_comment` \| `ai_roast` |
| `ts` | ISO 8601 | 事件时间戳，用于排序 |
| `repo` | string \| null | `owner/name` 格式，`ai_roast` 为 null |
| `semantic` | string \| null | 通过正则匹配 commit message 提取：`feat` / `fix` / `refactor` / `docs` / `merge` 等，用于前端色彩编码 |
| `data` | object | 按 `type` 不同，结构不同 |

---

## 5. AI 伴游模块

### 5.1 功能定位

在硬核的纯技术时间线中，插入具有趣味性和情绪价值的 AI 点评节点。打破"第四面墙"，让冰冷的数据流有温度。

### 5.2 接口设计

使用 OpenAI 兼容接口（`/v1/chat/completions`），用户自行配置：
- `LLM_API_KEY`：API 密钥（存入 GitHub Secrets）
- `LLM_BASE_URL`：API 端点（可选，默认 `https://api.openai.com/v1`）
- `LLM_MODEL`：模型名称（可选，默认 `gpt-4o`）

这意味着用户可以接入任何兼容 OpenAI 接口的服务（OpenAI、Anthropic via proxy、本地 Ollama 等）。

### 5.3 运转逻辑

```
每周聚合数据
    │
    ├─ 统计：commit 数、top 仓库、PR/review 数
    ├─ 采样：取最多 30 条有代表性的 commit message
    ├─ 采样：取最多 10 条 review 摘要
    │
    ▼
组装 prompt（system + user message）
    │
    ▼
调用 LLM API
    │
    ├─ 成功 → 生成 ai_roast 事件，插入对应周的月度 JSON
    └─ 失败 → 记录警告日志，跳过本周 AI 节点，正常发布数据
```

**上下文管理：** 不传原始全文，只传统计数据 + 采样摘要，确保 prompt 控制在 2000 token 以内，兼容所有模型。

### 5.4 Prompt 模式

通过 `devlog.config.js` 的 `aiRoast.promptMode` 配置预设人格：

| 模式 | System Prompt 风格 |
|---|---|
| `toxic_senior_dev` | 资深开发者的辛辣吐槽，指出可笑的 commit 模式和代码习惯 |
| `encouraging_mentor` | 温和的导师，肯定进步并给出建议 |
| `custom` | 用户通过 `aiRoast.customPrompt` 自定义完整 system prompt |

### 5.5 视觉呈现

`ai_roast` 节点在时间线中渲染为高对比度对话框气泡：
- 赛博朋克紫 / 霓虹粉配色，与常规代码日志形成鲜明反差
- 独立 AI Avatar 图标
- 带有 `weekRange` 标注，明确关联哪一周的活动

---

## 6. 前端展现

### 6.1 技术栈

**Astro + Vanilla TypeScript**

| 选型理由 | |
|---|---|
| 构建输出纯静态 HTML/CSS/JS | 与 GitHub Pages 无缝衔接 |
| 零运行时框架体积 | 首屏加载极快，第一印象至关重要 |
| Islands Architecture | 虚拟滚动等交互区域按需加载 JS，其余纯静态 |
| `.astro` 模板语法接近 HTML | 模板用户二次定制门槛低 |

虚拟滚动引擎使用 **TanStack Virtual**（纯逻辑库，框架无关）。

### 6.2 页面结构

```
┌──────────────────────────────────────────────────┐
│                  首屏：仪表盘                      │
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │  4,320        186        523        24   │   │
│   │  commits      PRs       reviews    repos │   │
│   │  (数字入场动画：从 0 滚动到目标值)          │   │
│   └──────────────────────────────────────────┘   │
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │  活动热力图 (类 GitHub Contribution Graph) │   │
│   │  天粒度，Primer 色阶配色                   │   │
│   └──────────────────────────────────────────┘   │
│                                                  │
│   ┌──────────────────────────────────────────┐   │
│   │  活跃仓库 Top 5 条形图                     │   │
│   └──────────────────────────────────────────┘   │
│                                                  │
│              ▼ 向下滚动进入时间线 ▼               │
├──────────────────────────────────────────────────┤
│  侧栏导航        │     主体：时间线信息流         │
│                  │                               │
│  2026-03 (342)   │  ┌─ commit ──────────────┐   │
│  2026-02 (256)   │  │ abc1234 feat(mm): ...  │   │
│  2026-01 (198)   │  │ +120 -15  SimpleKernel │   │
│  ...             │  └────────────────────────┘   │
│                  │                               │
│  ── 筛选 ──      │  ┌─ ai_roast ────────────┐   │
│  ☑ Commits       │  │ 🤖 本周你提交了47次... │   │
│  ☑ PRs           │  │ (赛博朋克紫气泡)       │   │
│  ☑ Reviews       │  └────────────────────────┘   │
│  ☑ Issues        │                               │
│  ☑ AI Roasts     │  ┌─ review ──────────────┐   │
│                  │  │ APPROVED rCore #128    │   │
│                  │  │ ▎ sfence.vma with ASID │   │
│                  │  └────────────────────────┘   │
│                  │                               │
│                  │  (虚拟滚动，仅渲染可视区域)    │
└──────────────────────────────────────────────────┘
```

### 6.3 设计规范

**主题系统：**
- 接入 GitHub Primer Design System CSS 变量体系
- 原生支持 Light / Dark 模式，跟随系统设置

**Logo / Favicon：**
- 极简风格，参考 Apple 和 GitHub 的图标设计语言
- 单色线条 / 几何图形为主，在 16x16 favicon 尺寸下仍可辨识
- 提供 SVG 源文件，方便模板用户替换

**视觉编码：**

| 元素 | 规则 |
|---|---|
| Commit SHA、代码片段 | Monospace 等宽字体 |
| `feat` 类事件 | 功能绿 `#238636` |
| `fix` 类事件 | 修复红 `#da3633` |
| `merge` 类事件 | 合并紫 `#8957e5` |
| `refactor` / `docs` 等 | 中性灰 |
| Review / Comment 引用 | 左侧粗边框 + 微量毛玻璃背景 |
| AI Roast 气泡 | 高对比霓虹色，独立视觉层级 |

**首屏动画：**
- 统计数字：从 0 滚动到目标值（CountUp 效果）
- 热力图：方块逐行淡入
- 整体氛围：克制，不用花哨粒子效果，让数据本身说话

**热力图实现：**
- 使用 **SVG** 实现，与 GitHub 原生 Contribution Graph 保持一致的技术方案
- 每个方块为一个 `<rect>` 元素，颜色通过 CSS 变量控制（天然支持 Light/Dark 切换）
- 粒度为天（与 GitHub 一致），色阶 5 级：无活动 → 低 → 中 → 高 → 极高
- SVG 天然支持缩放，在任意屏幕尺寸下保持清晰

### 6.4 响应式布局

采用 **Mobile-First** 策略，通过 CSS `@media` 断点适配不同设备：

| 断点 | 布局 | 说明 |
|---|---|---|
| `≥ 1024px` (Desktop) | 侧栏 + 主体双栏 | 侧栏固定在左侧，时间线占据右侧主体区域 |
| `768px ~ 1023px` (Tablet) | 侧栏折叠为顶部下拉 | 月份导航变为页面顶部的可展开下拉菜单，时间线全宽 |
| `< 768px` (Mobile) | 单栏全宽 | 仪表盘数字改为 2×2 网格，热力图横向可滚动，时间线卡片全宽简化 |

**关键适配细节：**
- 首屏仪表盘：桌面端一行四个数字 → 移动端 2×2 网格
- 热力图：桌面端完整展示 → 移动端横向滚动（`overflow-x: auto`），不缩放以保持可读性
- 时间线卡片：桌面端显示完整信息 → 移动端隐藏次要字段（如 additions/deletions），保留核心内容
- 侧栏筛选器：桌面端常驻 → 移动端收入顶部汉堡菜单

技术实现仅依赖 CSS Grid + `@media` 查询，不引入额外响应式框架。

### 6.5 多语言支持 (i18n)

UI 文案支持多语言，用户数据（commit message 等）保持原文不翻译。

**实现方案：**
- 语言文件存放在 `src/i18n/` 目录，每种语言一个 JSON 文件（如 `en.json`、`zh-CN.json`）
- 通过 `devlog.config.js` 中的 `locale` 字段配置，默认 `en`
- Astro 构建时静态替换文案，不增加运行时开销
- 初期支持：`en`（英语）、`zh-CN`（简体中文）

**翻译范围：**
- 仪表盘标签（"commits"、"PRs"、"reviews" 等）
- 侧栏导航文案
- 筛选器标签
- 时间格式化（遵循 locale 惯例）
- 空状态提示（"数据回填中，请等待..."）

### 6.6 渲染优化

| 策略 | 说明 |
|---|---|
| JSON 按月分片 | 初始仅加载 `index.json` + 当月数据 |
| 按需加载 | 滚动到对应月份时 fetch 该月 JSON |
| 虚拟滚动 | TanStack Virtual，浏览器内存中仅保留可视区域 ±buffer 的 DOM 节点 |
| 预计算高度 | 每种事件类型预估基础高度，避免渲染前 layout 抖动 |

---

## 7. 项目结构

```
/
├── .github/
│   └── workflows/
│       └── fetch-data.yml              # 数据抓取 + 构建 Action
├── src/
│   ├── layouts/
│   │   └── BaseLayout.astro            # HTML 骨架，引入 Primer CSS
│   ├── components/
│   │   ├── Dashboard.astro             # 首屏统计仪表盘
│   │   ├── Heatmap.astro               # 活动热力图
│   │   ├── Timeline.astro              # 时间线容器（挂载虚拟滚动）
│   │   ├── CommitNode.astro            # commit 事件卡片
│   │   ├── PRNode.astro                # PR 事件卡片
│   │   ├── ReviewNode.astro            # Code Review 卡片
│   │   ├── IssueNode.astro             # Issue 卡片
│   │   ├── CommentNode.astro           # Issue Comment 卡片
│   │   ├── AIRoastNode.astro           # AI 吐槽气泡
│   │   └── MonthNav.astro              # 月份导航侧栏
│   ├── i18n/
│   │   ├── en.json                     # 英语文案
│   │   └── zh-CN.json                  # 简体中文文案
│   ├── scripts/
│   │   ├── virtual-scroll.ts           # TanStack Virtual 初始化
│   │   ├── countup.ts                  # 数字滚动动画
│   │   └── heatmap.ts                  # 热力图渲染逻辑
│   ├── styles/
│   │   ├── primer-overrides.css        # Primer CSS 变量覆盖
│   │   ├── timeline.css                # 时间线样式
│   │   └── ai-roast.css               # AI 气泡霓虹样式
│   └── pages/
│       └── index.astro                 # 入口页
├── scripts/
│   ├── fetch-data.ts                   # 数据抓取主脚本
│   ├── graphql-queries.ts              # GraphQL 查询定义
│   ├── data-writer.ts                  # JSON 分片写入逻辑
│   └── ai-roast.ts                     # LLM 调用逻辑
├── data/                               # 自动生成，git tracked
│   ├── checkpoint.json
│   ├── index.json
│   └── 2026-03.json
├── devlog.config.js                    # 用户配置文件
├── astro.config.mjs
├── tsconfig.json
└── package.json
```

---

## 8. 用户配置 (`devlog.config.js`)

使用 CommonJS 格式（`.js` + `module.exports`），确保 Node.js 脚本和 Astro 构建均可直接 `require()` 读取，无需额外编译步骤。模板用户只需编辑这一个文件。

```javascript
module.exports = {
  // ─── 基本信息 ───
  username: "MRNIU",
  locale: "en",              // UI 语言: "en" | "zh-CN"

  // ─── 采集范围 ───
  scope: "all",              // "all" = 全网公开活动, "specific" = 仅 targetRepos
  targetRepos: [],           // scope 为 "specific" 时生效
  ignoredRepos: [            // 黑名单，始终排除
    "MRNIU/test-repo",
  ],

  // ─── 降噪过滤 ───
  filters: {
    ignoreShortComments: true,
    minCommentLength: 10,
    ignoreKeywords: ["wip", "update readme", "typo", "merge branch"],
  },

  // ─── AI 伴游 ───
  aiRoast: {
    enabled: true,
    frequency: "weekly",
    promptMode: "toxic_senior_dev",  // "toxic_senior_dev" | "encouraging_mentor" | "custom"
    customPrompt: "",                // promptMode 为 "custom" 时使用
  },

  // ─── LLM 接口 (环境变量覆盖优先) ───
  llm: {
    baseUrl: "https://api.openai.com/v1",  // 可被 LLM_BASE_URL 环境变量覆盖
    model: "gpt-4o",                       // 可被 LLM_MODEL 环境变量覆盖
    // API Key 仅通过 LLM_API_KEY 环境变量配置，不写入配置文件
  },

  // ─── 调度 ───
  schedule: {
    fetchCron: "0 2 * * *",  // 每日凌晨 2 点 UTC
  },
};
```

---

## 9. GitHub Actions Workflow

### 9.1 触发条件

```yaml
on:
  schedule:
    - cron: "0 2 * * *"    # 每日定时
  workflow_dispatch:         # 支持手动触发（首次运行 / 调试）
```

### 9.2 执行流程

Workflow 分为两个阶段：**数据抓取并提交**（更新 `data/`），然后 **Astro 构建并部署到 GitHub Pages**。

采用 Astro 官方推荐的 `actions/deploy-pages` 方案，不将构建产物提交到 git。

```yaml
jobs:
  # ─── 阶段一：数据抓取 ───
  fetch-data:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci

      - run: npm run fetch
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
          LLM_BASE_URL: ${{ vars.LLM_BASE_URL }}
          LLM_MODEL: ${{ vars.LLM_MODEL }}

      - name: Commit data changes
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add data/
          git diff --cached --quiet || (git commit -m "chore: update data" && git push)

  # ─── 阶段二：构建 + 部署 ───
  deploy:
    needs: fetch-data
    runs-on: ubuntu-latest
    permissions:
      pages: write
      id-token: write
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
        with:
          ref: main              # 拉取阶段一 push 后的最新 main

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - run: npm ci
      - run: npm run build

      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist/

      - id: deployment
        uses: actions/deploy-pages@v4
```

**说明：** 需要在仓库 Settings → Pages → Build and deployment → Source 中选择 **"GitHub Actions"**。

---

## 10. 部署接入流程

使用该模板的标准化步骤：

1. **Use Template** — 点击 "Use this template" 创建名为 `<你的ID>.github.io` 的公开仓库
2. **修改配置** — 编辑 `devlog.config.js`，填入你的 GitHub 用户名和偏好设置
3. **开启权限** — 两处设置：
   - Settings → Actions → General → Workflow permissions → "Read and write permissions"
   - Settings → Pages → Build and deployment → Source → "GitHub Actions"
4. **配置 AI（可选）** — 仓库 Settings → Secrets and variables → Actions → 添加 `LLM_API_KEY`
5. **首次运行** — Actions 页面手动触发 workflow，完成首次数据灌入和页面上线
6. **等待回填** — 后续每日自动运行，逐步回填完整历史记录
7. **自定义域名（可选）** — 如需绑定自定义域名，用户自行在仓库 Settings → Pages → Custom domain 中配置，并完成 DNS 设置。本模板不做额外封装，GitHub 官方文档已足够清晰。
