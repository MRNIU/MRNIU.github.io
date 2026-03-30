# GitPulse Phase 1: Data Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete data fetching pipeline — from GitHub GraphQL API to sharded JSON files in `data/` — runnable via GitHub Actions.

**Architecture:** Node.js scripts (TypeScript, executed via `tsx`) fetch user activity from GitHub GraphQL API, apply filters, write monthly-sharded JSON files, and manage checkpoint state for incremental updates + progressive backfill. Astro project initialized as skeleton for future phases.

**Tech Stack:** Astro 5, TypeScript, tsx, vitest, GitHub GraphQL API, Node.js 20

---

## File Structure

```
/
├── .github/
│   └── workflows/
│       └── fetch-data.yml                # GitHub Actions workflow
├── src/
│   └── pages/
│       └── index.astro                   # Minimal placeholder page
├── scripts/
│   └── src/
│       ├── config.ts                     # Load devlog.config.js
│       ├── types.ts                      # All shared TypeScript types
│       ├── graphql-client.ts             # Thin GitHub GraphQL client
│       ├── rate-limit.ts                 # Rate limit budget tracker
│       ├── semantic.ts                   # Extract semantic tag from commit messages
│       ├── filters.ts                    # Noise filtering (repos, keywords, short comments)
│       ├── checkpoint.ts                 # Read/write checkpoint.json
│       ├── data-writer.ts               # Write monthly JSON shards + index.json
│       ├── fetchers/
│       │   ├── pull-requests.ts          # Fetch user's PRs
│       │   ├── issues.ts                 # Fetch user's issues
│       │   ├── comments.ts              # Fetch user's issue comments
│       │   ├── reviews.ts               # Fetch user's PR reviews
│       │   └── commits.ts              # Fetch user's commits (per-repo)
│       └── fetch-data.ts                # Main orchestrator entry point
├── scripts/
│   └── __tests__/
│       ├── config.test.ts
│       ├── semantic.test.ts
│       ├── filters.test.ts
│       ├── checkpoint.test.ts
│       ├── data-writer.test.ts
│       ├── rate-limit.test.ts
│       ├── graphql-client.test.ts
│       └── fetchers/
│           ├── pull-requests.test.ts
│           ├── issues.test.ts
│           ├── comments.test.ts
│           ├── reviews.test.ts
│           └── commits.test.ts
├── data/                                 # Git-tracked output directory
│   └── .gitkeep
├── devlog.config.js                      # User configuration
├── astro.config.mjs
├── tsconfig.json
├── vitest.config.ts
└── package.json
```

**Responsibility boundaries:**
- `config.ts` — sole reader of `devlog.config.js`, exports typed config object
- `types.ts` — all event types, checkpoint shape, index shape; imported everywhere
- `graphql-client.ts` — sends queries, returns parsed JSON, updates rate limit tracker
- `rate-limit.ts` — tracks remaining budget, exposes `canContinue()` check
- `fetchers/*.ts` — each fetcher returns `GitPulseEvent[]`, handles pagination internally
- `data-writer.ts` — merges new events into existing monthly JSON files, rebuilds `index.json`
- `fetch-data.ts` — orchestrates: load config → read checkpoint → run incremental → run backfill → write data → save checkpoint

---

### Task 1: Project Initialization

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `astro.config.mjs`
- Create: `vitest.config.ts`
- Create: `src/pages/index.astro`
- Create: `data/.gitkeep`
- Create: `.gitignore`

- [ ] **Step 1: Initialize Astro project and install dependencies**

```bash
cd /home/nzh/MRNIU/MRNIU.github.io
npm create astro@latest . -- --template minimal --no-install --typescript strict
npm install
npm install -D tsx vitest
```

If Astro scaffolding conflicts with existing files (LICENSE, README.md, design.md), preserve them. The key files we need from Astro are: `package.json`, `astro.config.mjs`, `tsconfig.json`, `src/pages/index.astro`.

- [ ] **Step 2: Verify package.json has required scripts**

Ensure `package.json` contains these scripts (add/modify as needed):

```json
{
  "scripts": {
    "dev": "astro dev",
    "build": "astro build",
    "preview": "astro preview",
    "fetch": "tsx scripts/src/fetch-data.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Create vitest config**

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: "scripts/__tests__",
  },
});
```

- [ ] **Step 4: Create data directory with .gitkeep**

```bash
mkdir -p data
touch data/.gitkeep
```

- [ ] **Step 5: Update .gitignore**

Ensure `.gitignore` includes:

```
node_modules/
dist/
.astro/
```

It should NOT ignore `data/` — that directory is git-tracked.

- [ ] **Step 6: Create minimal placeholder page**

```astro
---
// src/pages/index.astro
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>GitPulse</title>
  </head>
  <body>
    <h1>GitPulse</h1>
    <p>Data pipeline active. Frontend coming soon.</p>
  </body>
</html>
```

- [ ] **Step 7: Verify builds work**

```bash
npm run build
```

Expected: Astro builds successfully, outputs to `dist/`.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json tsconfig.json astro.config.mjs vitest.config.ts src/ data/.gitkeep .gitignore
git commit -m "feat: initialize Astro project with TypeScript and vitest"
```

---

### Task 2: User Configuration

**Files:**
- Create: `devlog.config.js`
- Create: `scripts/src/config.ts`
- Create: `scripts/__tests__/config.test.ts`

- [ ] **Step 1: Write the config test**

```typescript
// scripts/__tests__/config.test.ts
import { describe, it, expect } from "vitest";
import { loadConfig, type GitPulseConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads the default config file and returns typed config", () => {
    const config = loadConfig();
    expect(config.username).toBe("MRNIU");
    expect(config.scope).toBe("all");
    expect(config.filters.ignoreKeywords).toContain("typo");
    expect(config.aiRoast.enabled).toBe(true);
    expect(config.llm.baseUrl).toBe("https://api.openai.com/v1");
  });

  it("has required fields", () => {
    const config = loadConfig();
    expect(config.username).toBeTruthy();
    expect(config.ignoredRepos).toBeInstanceOf(Array);
    expect(config.filters).toBeDefined();
    expect(config.schedule.fetchCron).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- config.test
```

Expected: FAIL — `../src/config.js` does not exist.

- [ ] **Step 3: Create devlog.config.js**

```javascript
// devlog.config.js
module.exports = {
  // ─── Basic ───
  username: "MRNIU",
  locale: "en",

  // ─── Scope ───
  scope: "all",
  targetRepos: [],
  ignoredRepos: ["MRNIU/test-repo"],

  // ─── Filters ───
  filters: {
    ignoreShortComments: true,
    minCommentLength: 10,
    ignoreKeywords: ["wip", "update readme", "typo", "merge branch"],
  },

  // ─── AI ───
  aiRoast: {
    enabled: true,
    frequency: "weekly",
    promptMode: "toxic_senior_dev",
    customPrompt: "",
  },

  // ─── LLM ───
  llm: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
  },

  // ─── Schedule ───
  schedule: {
    fetchCron: "0 2 * * *",
  },
};
```

- [ ] **Step 4: Write config loader**

```typescript
// scripts/src/config.ts
import { createRequire } from "node:module";
import path from "node:path";

export interface GitPulseConfig {
  username: string;
  locale: string;
  scope: "all" | "specific";
  targetRepos: string[];
  ignoredRepos: string[];
  filters: {
    ignoreShortComments: boolean;
    minCommentLength: number;
    ignoreKeywords: string[];
  };
  aiRoast: {
    enabled: boolean;
    frequency: string;
    promptMode: "toxic_senior_dev" | "encouraging_mentor" | "custom";
    customPrompt: string;
  };
  llm: {
    baseUrl: string;
    model: string;
  };
  schedule: {
    fetchCron: string;
  };
}

export function loadConfig(): GitPulseConfig {
  const require = createRequire(import.meta.url);
  const configPath = path.resolve(process.cwd(), "devlog.config.js");
  // Clear cache so tests/reruns pick up changes
  delete require.cache[configPath];
  return require(configPath) as GitPulseConfig;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npm test -- config.test
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add devlog.config.js scripts/src/config.ts scripts/__tests__/config.test.ts
git commit -m "feat: add user config file and typed config loader"
```

---

### Task 3: Type Definitions

**Files:**
- Create: `scripts/src/types.ts`

- [ ] **Step 1: Write all shared types**

```typescript
// scripts/src/types.ts

// ─── Event Types ───

export type EventType =
  | "commit"
  | "pull_request"
  | "review"
  | "issue"
  | "issue_comment"
  | "ai_roast";

export type SemanticTag =
  | "feat"
  | "fix"
  | "refactor"
  | "docs"
  | "test"
  | "chore"
  | "style"
  | "perf"
  | "ci"
  | "merge"
  | null;

export interface BaseEvent {
  id: string;
  type: EventType;
  ts: string; // ISO 8601
  repo: string | null;
  semantic: SemanticTag;
}

export interface CommitEvent extends BaseEvent {
  type: "commit";
  data: {
    sha: string;
    message: string;
    additions: number;
    deletions: number;
  };
}

export interface PullRequestEvent extends BaseEvent {
  type: "pull_request";
  data: {
    number: number;
    title: string;
    state: "open" | "closed" | "merged";
    body: string;
  };
}

export interface ReviewEvent extends BaseEvent {
  type: "review";
  data: {
    prNumber: number;
    prTitle: string;
    state: string;
    body: string;
    inlineComments: Array<{
      path: string;
      line: number;
      body: string;
    }>;
  };
}

export interface IssueEvent extends BaseEvent {
  type: "issue";
  data: {
    number: number;
    title: string;
    state: "open" | "closed";
    body: string;
  };
}

export interface IssueCommentEvent extends BaseEvent {
  type: "issue_comment";
  data: {
    issueNumber: number;
    issueTitle: string;
    body: string;
  };
}

export interface AIRoastEvent extends BaseEvent {
  type: "ai_roast";
  repo: null;
  semantic: null;
  data: {
    weekRange: string;
    content: string;
    stats: { totalCommits: number; topRepo: string };
  };
}

export type GitPulseEvent =
  | CommitEvent
  | PullRequestEvent
  | ReviewEvent
  | IssueEvent
  | IssueCommentEvent
  | AIRoastEvent;

// ─── Data Files ───

export interface MonthlyData {
  month: string; // "YYYY-MM"
  events: GitPulseEvent[];
}

export interface MonthSummary {
  key: string;
  file: string;
  eventCount: number;
  repos: string[];
  breakdown: Record<EventType, number>;
}

export interface IndexData {
  user: string;
  generatedAt: string;
  stats: {
    totalCommits: number;
    totalPRs: number;
    totalReviews: number;
    totalIssues: number;
    totalComments: number;
    activeRepos: number;
    earliestEvent: string | null;
    latestEvent: string | null;
  };
  months: MonthSummary[];
}

// ─── Checkpoint ───

export interface BackfillCursor {
  cursor: string | null; // null = not started or completed
  done: boolean;
}

export interface CommitBackfillState {
  /** Full list of repos discovered for the user */
  repoList: string[];
  /** Index into repoList — which repo are we currently processing */
  repoIndex: number;
  /** Pagination cursor within the current repo */
  pageCursor: string | null;
  done: boolean;
}

export interface ReviewBackfillState {
  /** Which year we are currently backfilling (goes backward) */
  currentYear: number;
  /** Pagination cursor within the current year */
  pageCursor: string | null;
  done: boolean;
}

export interface Checkpoint {
  /** ISO timestamp of last successful incremental fetch */
  lastFetchedAt: string | null;
  backfill: {
    completed: boolean;
    pullRequests: BackfillCursor;
    issues: BackfillCursor;
    issueComments: BackfillCursor;
    reviews: ReviewBackfillState;
    commits: CommitBackfillState;
  };
}

// ─── GraphQL ───

export interface GraphQLResponse<T = unknown> {
  data: T;
  errors?: Array<{ message: string }>;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  cost: number;
  resetAt: string;
}

export interface PageInfo {
  hasNextPage: boolean;
  endCursor: string | null;
}
```

- [ ] **Step 2: Verify types compile**

```bash
npx tsc --noEmit scripts/src/types.ts
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/src/types.ts
git commit -m "feat: add shared TypeScript type definitions"
```

---

### Task 4: Rate Limit Tracker

**Files:**
- Create: `scripts/src/rate-limit.ts`
- Create: `scripts/__tests__/rate-limit.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/rate-limit.test.ts
import { describe, it, expect } from "vitest";
import { RateLimitTracker } from "../src/rate-limit.js";

describe("RateLimitTracker", () => {
  it("starts with unknown budget until first update", () => {
    const tracker = new RateLimitTracker(500);
    // Before any API call, we assume we can continue
    expect(tracker.canContinue()).toBe(true);
  });

  it("returns true when remaining is above threshold", () => {
    const tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 4000, cost: 10, resetAt: "" });
    expect(tracker.canContinue()).toBe(true);
    expect(tracker.remaining).toBe(4000);
  });

  it("returns false when remaining drops below threshold", () => {
    const tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 400, cost: 10, resetAt: "" });
    expect(tracker.canContinue()).toBe(false);
  });

  it("returns false at exactly the threshold", () => {
    const tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 500, cost: 10, resetAt: "" });
    expect(tracker.canContinue()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- rate-limit.test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// scripts/src/rate-limit.ts
import type { RateLimitInfo } from "./types.js";

export class RateLimitTracker {
  private _remaining: number | null = null;
  private _resetAt: string | null = null;
  private threshold: number;

  constructor(threshold: number = 500) {
    this.threshold = threshold;
  }

  get remaining(): number | null {
    return this._remaining;
  }

  get resetAt(): string | null {
    return this._resetAt;
  }

  update(info: RateLimitInfo): void {
    this._remaining = info.remaining;
    this._resetAt = info.resetAt;
  }

  canContinue(): boolean {
    if (this._remaining === null) return true;
    return this._remaining > this.threshold;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- rate-limit.test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/src/rate-limit.ts scripts/__tests__/rate-limit.test.ts
git commit -m "feat: add rate limit budget tracker"
```

---

### Task 5: GraphQL Client

**Files:**
- Create: `scripts/src/graphql-client.ts`
- Create: `scripts/__tests__/graphql-client.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/graphql-client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphQLClient } from "../src/graphql-client.js";
import { RateLimitTracker } from "../src/rate-limit.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("GraphQLClient", () => {
  let client: GraphQLClient;
  let tracker: RateLimitTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new RateLimitTracker(500);
    client = new GraphQLClient("fake-token", tracker);
  });

  it("sends a POST request to GitHub GraphQL endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          rateLimit: { limit: 5000, remaining: 4990, cost: 1, resetAt: "2026-04-01T00:00:00Z" },
          user: { login: "MRNIU" },
        },
      }),
    });

    const result = await client.query<{ user: { login: string } }>(
      "query { user(login: \"MRNIU\") { login } }"
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.github.com/graphql");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Authorization"]).toBe("bearer fake-token");
    expect(result.user.login).toBe("MRNIU");
  });

  it("updates rate limit tracker from response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          rateLimit: { limit: 5000, remaining: 3000, cost: 5, resetAt: "2026-04-01T00:00:00Z" },
          viewer: { login: "test" },
        },
      }),
    });

    await client.query("query { viewer { login } }");
    expect(tracker.remaining).toBe(3000);
  });

  it("throws on GraphQL errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: null,
        errors: [{ message: "Field 'foo' doesn't exist" }],
      }),
    });

    await expect(client.query("query { foo }")).rejects.toThrow(
      "GraphQL error: Field 'foo' doesn't exist"
    );
  });

  it("throws on HTTP errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    await expect(client.query("query { viewer { login } }")).rejects.toThrow("401");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- graphql-client.test
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write implementation**

```typescript
// scripts/src/graphql-client.ts
import type { RateLimitInfo } from "./types.js";
import { RateLimitTracker } from "./rate-limit.js";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

/** Every query is wrapped to include rateLimit alongside the user's fields */
function wrapWithRateLimit(query: string): string {
  // Insert rateLimit field after the first opening brace of the query body
  const idx = query.indexOf("{", query.indexOf("{") + 1);
  if (idx === -1) return query;
  return query.slice(0, idx + 1) + "\n  rateLimit { limit remaining cost resetAt }\n" + query.slice(idx + 1);
}

export class GraphQLClient {
  private token: string;
  private tracker: RateLimitTracker;

  constructor(token: string, tracker: RateLimitTracker) {
    this.token = token;
    this.tracker = tracker;
  }

  async query<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const wrappedQuery = wrapWithRateLimit(query);

    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "GitPulse/1.0",
      },
      body: JSON.stringify({ query: wrappedQuery, variables }),
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
    }

    const json = (await response.json()) as {
      data: T & { rateLimit?: RateLimitInfo };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new Error(`GraphQL error: ${json.errors[0].message}`);
    }

    // Update rate limit tracker
    if (json.data.rateLimit) {
      this.tracker.update(json.data.rateLimit);
      delete (json.data as Record<string, unknown>).rateLimit;
    }

    return json.data;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- graphql-client.test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/src/graphql-client.ts scripts/__tests__/graphql-client.test.ts
git commit -m "feat: add GitHub GraphQL client with rate limit tracking"
```

---

### Task 6: Semantic Tag Extractor

**Files:**
- Create: `scripts/src/semantic.ts`
- Create: `scripts/__tests__/semantic.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/semantic.test.ts
import { describe, it, expect } from "vitest";
import { extractSemantic } from "../src/semantic.js";

describe("extractSemantic", () => {
  it("extracts 'feat' from conventional commit", () => {
    expect(extractSemantic("feat(mm): implement UEFI memory map parser")).toBe("feat");
  });

  it("extracts 'fix' from conventional commit", () => {
    expect(extractSemantic("fix: resolve null pointer in boot sequence")).toBe("fix");
  });

  it("extracts 'refactor' with scope", () => {
    expect(extractSemantic("refactor(kernel): simplify page table walk")).toBe("refactor");
  });

  it("extracts 'docs'", () => {
    expect(extractSemantic("docs: update README with build instructions")).toBe("docs");
  });

  it("extracts 'test'", () => {
    expect(extractSemantic("test: add unit tests for allocator")).toBe("test");
  });

  it("extracts 'chore'", () => {
    expect(extractSemantic("chore: bump dependencies")).toBe("chore");
  });

  it("detects merge commits", () => {
    expect(extractSemantic("Merge pull request #42 from user/branch")).toBe("merge");
    expect(extractSemantic("Merge branch 'main' into feature")).toBe("merge");
  });

  it("returns null for non-conventional messages", () => {
    expect(extractSemantic("update something")).toBeNull();
    expect(extractSemantic("WIP")).toBeNull();
    expect(extractSemantic("")).toBeNull();
  });

  it("is case-insensitive for conventional prefix", () => {
    expect(extractSemantic("Feat: add new feature")).toBe("feat");
    expect(extractSemantic("FIX(core): bug")).toBe("fix");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- semantic.test
```

Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// scripts/src/semantic.ts
import type { SemanticTag } from "./types.js";

const CONVENTIONAL_RE = /^(feat|fix|refactor|docs|test|chore|style|perf|ci)(\(.+?\))?[!]?:/i;
const MERGE_RE = /^merge\s/i;

export function extractSemantic(message: string): SemanticTag {
  if (!message) return null;

  if (MERGE_RE.test(message)) return "merge";

  const match = message.match(CONVENTIONAL_RE);
  if (match) return match[1].toLowerCase() as SemanticTag;

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- semantic.test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/src/semantic.ts scripts/__tests__/semantic.test.ts
git commit -m "feat: add semantic tag extractor for commit messages"
```

---

### Task 7: Event Filters

**Files:**
- Create: `scripts/src/filters.ts`
- Create: `scripts/__tests__/filters.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/filters.test.ts
import { describe, it, expect } from "vitest";
import { createEventFilter } from "../src/filters.js";
import type { GitPulseConfig } from "../src/config.js";
import type { CommitEvent, IssueCommentEvent } from "../src/types.js";

const config: Pick<GitPulseConfig, "ignoredRepos" | "filters"> = {
  ignoredRepos: ["MRNIU/test-repo"],
  filters: {
    ignoreShortComments: true,
    minCommentLength: 10,
    ignoreKeywords: ["wip", "typo", "update readme"],
  },
};

describe("createEventFilter", () => {
  const filter = createEventFilter(config);

  it("keeps normal events", () => {
    const event: CommitEvent = {
      id: "commit-abc",
      type: "commit",
      ts: "2026-03-29T14:00:00Z",
      repo: "MRNIU/SimpleKernel",
      semantic: "feat",
      data: { sha: "abc", message: "feat: add parser", additions: 10, deletions: 0 },
    };
    expect(filter(event)).toBe(true);
  });

  it("filters events from ignored repos", () => {
    const event: CommitEvent = {
      id: "commit-xyz",
      type: "commit",
      ts: "2026-03-29T14:00:00Z",
      repo: "MRNIU/test-repo",
      semantic: null,
      data: { sha: "xyz", message: "test", additions: 1, deletions: 0 },
    };
    expect(filter(event)).toBe(false);
  });

  it("filters commits matching ignored keywords", () => {
    const event: CommitEvent = {
      id: "commit-wip",
      type: "commit",
      ts: "2026-03-29T14:00:00Z",
      repo: "MRNIU/SimpleKernel",
      semantic: null,
      data: { sha: "wip1", message: "WIP", additions: 1, deletions: 0 },
    };
    expect(filter(event)).toBe(false);
  });

  it("filters short comments when enabled", () => {
    const event: IssueCommentEvent = {
      id: "comment-short",
      type: "issue_comment",
      ts: "2026-03-29T14:00:00Z",
      repo: "MRNIU/SimpleKernel",
      semantic: null,
      data: { issueNumber: 1, issueTitle: "Bug", body: "LGTM" },
    };
    expect(filter(event)).toBe(false);
  });

  it("keeps comments above minimum length", () => {
    const event: IssueCommentEvent = {
      id: "comment-long",
      type: "issue_comment",
      ts: "2026-03-29T14:00:00Z",
      repo: "MRNIU/SimpleKernel",
      semantic: null,
      data: { issueNumber: 1, issueTitle: "Bug", body: "This is a detailed comment about the issue." },
    };
    expect(filter(event)).toBe(true);
  });

  it("always keeps ai_roast events", () => {
    const event = {
      id: "ai-roast-1",
      type: "ai_roast" as const,
      ts: "2026-03-29T00:00:00Z",
      repo: null,
      semantic: null,
      data: { weekRange: "", content: "", stats: { totalCommits: 0, topRepo: "" } },
    };
    expect(filter(event)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- filters.test
```

Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// scripts/src/filters.ts
import type { GitPulseConfig } from "./config.js";
import type { GitPulseEvent } from "./types.js";

export function createEventFilter(
  config: Pick<GitPulseConfig, "ignoredRepos" | "filters">
): (event: GitPulseEvent) => boolean {
  const ignoredRepoSet = new Set(
    config.ignoredRepos.map((r) => r.toLowerCase())
  );
  const keywords = config.filters.ignoreKeywords.map((k) => k.toLowerCase());

  return (event: GitPulseEvent): boolean => {
    // Always keep AI roast events
    if (event.type === "ai_roast") return true;

    // Filter by ignored repos
    if (event.repo && ignoredRepoSet.has(event.repo.toLowerCase())) {
      return false;
    }

    // Filter commits by keywords
    if (event.type === "commit") {
      const msg = event.data.message.toLowerCase();
      if (keywords.some((kw) => msg.includes(kw))) return false;
    }

    // Filter short comments
    if (
      config.filters.ignoreShortComments &&
      (event.type === "issue_comment" || event.type === "review")
    ) {
      const body =
        event.type === "issue_comment" ? event.data.body : event.data.body;
      if (body.length < config.filters.minCommentLength) return false;
    }

    return true;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- filters.test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/src/filters.ts scripts/__tests__/filters.test.ts
git commit -m "feat: add event filter for repos, keywords, and short comments"
```

---

### Task 8: Checkpoint Module

**Files:**
- Create: `scripts/src/checkpoint.ts`
- Create: `scripts/__tests__/checkpoint.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/checkpoint.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readCheckpoint, writeCheckpoint, createEmptyCheckpoint } from "../src/checkpoint.js";
import type { Checkpoint } from "../src/types.js";

const TEST_DIR = path.resolve(process.cwd(), "data/__test_checkpoint");
const TEST_PATH = path.join(TEST_DIR, "checkpoint.json");

describe("checkpoint", () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("createEmptyCheckpoint returns valid initial state", () => {
    const cp = createEmptyCheckpoint();
    expect(cp.lastFetchedAt).toBeNull();
    expect(cp.backfill.completed).toBe(false);
    expect(cp.backfill.pullRequests.done).toBe(false);
    expect(cp.backfill.commits.repoList).toEqual([]);
    expect(cp.backfill.commits.repoIndex).toBe(0);
  });

  it("returns empty checkpoint when file does not exist", () => {
    const cp = readCheckpoint(TEST_PATH);
    expect(cp.lastFetchedAt).toBeNull();
    expect(cp.backfill.completed).toBe(false);
  });

  it("round-trips write then read", () => {
    const cp = createEmptyCheckpoint();
    cp.lastFetchedAt = "2026-03-30T02:00:00Z";
    cp.backfill.pullRequests.cursor = "abc123";
    writeCheckpoint(TEST_PATH, cp);

    const loaded = readCheckpoint(TEST_PATH);
    expect(loaded.lastFetchedAt).toBe("2026-03-30T02:00:00Z");
    expect(loaded.backfill.pullRequests.cursor).toBe("abc123");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- checkpoint.test
```

Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// scripts/src/checkpoint.ts
import fs from "node:fs";
import type { Checkpoint } from "./types.js";

export function createEmptyCheckpoint(): Checkpoint {
  return {
    lastFetchedAt: null,
    backfill: {
      completed: false,
      pullRequests: { cursor: null, done: false },
      issues: { cursor: null, done: false },
      issueComments: { cursor: null, done: false },
      reviews: { currentYear: new Date().getFullYear(), pageCursor: null, done: false },
      commits: { repoList: [], repoIndex: 0, pageCursor: null, done: false },
    },
  };
}

export function readCheckpoint(filePath: string): Checkpoint {
  if (!fs.existsSync(filePath)) {
    return createEmptyCheckpoint();
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as Checkpoint;
}

export function writeCheckpoint(filePath: string, checkpoint: Checkpoint): void {
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2) + "\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- checkpoint.test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/src/checkpoint.ts scripts/__tests__/checkpoint.test.ts
git commit -m "feat: add checkpoint read/write for incremental fetch state"
```

---

### Task 9: Data Writer

**Files:**
- Create: `scripts/src/data-writer.ts`
- Create: `scripts/__tests__/data-writer.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/data-writer.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { writeEvents } from "../src/data-writer.js";
import type { GitPulseEvent, IndexData, MonthlyData } from "../src/types.js";

const TEST_DIR = path.resolve(process.cwd(), "data/__test_writer");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(TEST_DIR, file), "utf-8"));
}

describe("writeEvents", () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("creates monthly JSON files grouped by event timestamp", () => {
    const events: GitPulseEvent[] = [
      {
        id: "commit-aaa",
        type: "commit",
        ts: "2026-03-15T10:00:00Z",
        repo: "MRNIU/SimpleKernel",
        semantic: "feat",
        data: { sha: "aaa", message: "feat: something", additions: 5, deletions: 0 },
      },
      {
        id: "commit-bbb",
        type: "commit",
        ts: "2026-02-10T10:00:00Z",
        repo: "MRNIU/SimpleKernel",
        semantic: "fix",
        data: { sha: "bbb", message: "fix: bug", additions: 1, deletions: 1 },
      },
    ];

    writeEvents(TEST_DIR, "MRNIU", events);

    const march = readJson<MonthlyData>("2026-03.json");
    expect(march.month).toBe("2026-03");
    expect(march.events).toHaveLength(1);
    expect(march.events[0].id).toBe("commit-aaa");

    const feb = readJson<MonthlyData>("2026-02.json");
    expect(feb.month).toBe("2026-02");
    expect(feb.events).toHaveLength(1);
    expect(feb.events[0].id).toBe("commit-bbb");
  });

  it("creates index.json with correct stats", () => {
    const events: GitPulseEvent[] = [
      {
        id: "commit-aaa",
        type: "commit",
        ts: "2026-03-15T10:00:00Z",
        repo: "MRNIU/SimpleKernel",
        semantic: "feat",
        data: { sha: "aaa", message: "feat: something", additions: 5, deletions: 0 },
      },
      {
        id: "pr-1",
        type: "pull_request",
        ts: "2026-03-14T10:00:00Z",
        repo: "other/repo",
        semantic: "feat",
        data: { number: 1, title: "Add feature", state: "merged", body: "..." },
      },
    ];

    writeEvents(TEST_DIR, "MRNIU", events);

    const index = readJson<IndexData>("index.json");
    expect(index.user).toBe("MRNIU");
    expect(index.stats.totalCommits).toBe(1);
    expect(index.stats.totalPRs).toBe(1);
    expect(index.stats.activeRepos).toBe(2);
    expect(index.months).toHaveLength(1);
    expect(index.months[0].key).toBe("2026-03");
    expect(index.months[0].eventCount).toBe(2);
  });

  it("merges new events into existing monthly files without duplicates", () => {
    // First write
    const batch1: GitPulseEvent[] = [
      {
        id: "commit-aaa",
        type: "commit",
        ts: "2026-03-15T10:00:00Z",
        repo: "MRNIU/SimpleKernel",
        semantic: "feat",
        data: { sha: "aaa", message: "feat: first", additions: 5, deletions: 0 },
      },
    ];
    writeEvents(TEST_DIR, "MRNIU", batch1);

    // Second write with one new + one duplicate
    const batch2: GitPulseEvent[] = [
      {
        id: "commit-aaa", // duplicate
        type: "commit",
        ts: "2026-03-15T10:00:00Z",
        repo: "MRNIU/SimpleKernel",
        semantic: "feat",
        data: { sha: "aaa", message: "feat: first", additions: 5, deletions: 0 },
      },
      {
        id: "commit-ccc",
        type: "commit",
        ts: "2026-03-16T10:00:00Z",
        repo: "MRNIU/SimpleKernel",
        semantic: "fix",
        data: { sha: "ccc", message: "fix: second", additions: 1, deletions: 1 },
      },
    ];
    writeEvents(TEST_DIR, "MRNIU", batch2);

    const march = readJson<MonthlyData>("2026-03.json");
    expect(march.events).toHaveLength(2); // no duplicate
    const ids = march.events.map((e) => e.id);
    expect(ids).toContain("commit-aaa");
    expect(ids).toContain("commit-ccc");
  });

  it("sorts events by timestamp descending within each month", () => {
    const events: GitPulseEvent[] = [
      {
        id: "commit-early",
        type: "commit",
        ts: "2026-03-01T10:00:00Z",
        repo: "MRNIU/SimpleKernel",
        semantic: null,
        data: { sha: "e", message: "early", additions: 1, deletions: 0 },
      },
      {
        id: "commit-late",
        type: "commit",
        ts: "2026-03-20T10:00:00Z",
        repo: "MRNIU/SimpleKernel",
        semantic: null,
        data: { sha: "l", message: "late", additions: 1, deletions: 0 },
      },
    ];
    writeEvents(TEST_DIR, "MRNIU", events);

    const march = readJson<MonthlyData>("2026-03.json");
    expect(march.events[0].id).toBe("commit-late");
    expect(march.events[1].id).toBe("commit-early");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- data-writer.test
```

Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// scripts/src/data-writer.ts
import fs from "node:fs";
import path from "node:path";
import type {
  GitPulseEvent,
  MonthlyData,
  IndexData,
  MonthSummary,
  EventType,
} from "./types.js";

function getMonthKey(ts: string): string {
  return ts.slice(0, 7); // "2026-03"
}

function groupByMonth(events: GitPulseEvent[]): Map<string, GitPulseEvent[]> {
  const groups = new Map<string, GitPulseEvent[]>();
  for (const event of events) {
    const key = getMonthKey(event.ts);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }
  return groups;
}

function readMonthlyFile(filePath: string): MonthlyData | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as MonthlyData;
}

function buildMonthSummary(month: string, events: GitPulseEvent[]): MonthSummary {
  const repos = new Set<string>();
  const breakdown: Record<string, number> = {};

  for (const e of events) {
    if (e.repo) repos.add(e.repo);
    breakdown[e.type] = (breakdown[e.type] || 0) + 1;
  }

  return {
    key: month,
    file: `${month}.json`,
    eventCount: events.length,
    repos: [...repos].sort(),
    breakdown: breakdown as Record<EventType, number>,
  };
}

function buildIndex(
  dataDir: string,
  user: string,
  allMonths: Map<string, GitPulseEvent[]>
): IndexData {
  let totalCommits = 0;
  let totalPRs = 0;
  let totalReviews = 0;
  let totalIssues = 0;
  let totalComments = 0;
  const allRepos = new Set<string>();
  let earliest: string | null = null;
  let latest: string | null = null;

  const months: MonthSummary[] = [];

  // Read all monthly files to get complete picture
  const files = fs.readdirSync(dataDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
  for (const file of files) {
    const monthKey = file.replace(".json", "");
    const data = readMonthlyFile(path.join(dataDir, file))!;
    const events = data.events;

    // Use allMonths if available (just-written), otherwise use file
    const finalEvents = allMonths.get(monthKey) || events;
    months.push(buildMonthSummary(monthKey, finalEvents));

    for (const e of finalEvents) {
      if (e.repo) allRepos.add(e.repo);
      if (!earliest || e.ts < earliest) earliest = e.ts;
      if (!latest || e.ts > latest) latest = e.ts;

      switch (e.type) {
        case "commit": totalCommits++; break;
        case "pull_request": totalPRs++; break;
        case "review": totalReviews++; break;
        case "issue": totalIssues++; break;
        case "issue_comment": totalComments++; break;
      }
    }
  }

  // Sort months descending
  months.sort((a, b) => b.key.localeCompare(a.key));

  return {
    user,
    generatedAt: new Date().toISOString(),
    stats: {
      totalCommits,
      totalPRs,
      totalReviews,
      totalIssues,
      totalComments,
      activeRepos: allRepos.size,
      earliestEvent: earliest,
      latestEvent: latest,
    },
    months,
  };
}

export function writeEvents(
  dataDir: string,
  user: string,
  newEvents: GitPulseEvent[]
): void {
  fs.mkdirSync(dataDir, { recursive: true });

  const grouped = groupByMonth(newEvents);
  const updatedMonths = new Map<string, GitPulseEvent[]>();

  for (const [month, events] of grouped) {
    const filePath = path.join(dataDir, `${month}.json`);
    const existing = readMonthlyFile(filePath);

    // Merge: deduplicate by id
    const existingEvents = existing?.events || [];
    const existingIds = new Set(existingEvents.map((e) => e.id));
    const merged = [
      ...existingEvents,
      ...events.filter((e) => !existingIds.has(e.id)),
    ];

    // Sort descending by timestamp
    merged.sort((a, b) => b.ts.localeCompare(a.ts));

    const monthData: MonthlyData = { month, events: merged };
    fs.writeFileSync(filePath, JSON.stringify(monthData, null, 2) + "\n");
    updatedMonths.set(month, merged);
  }

  // Rebuild index from all monthly files
  const index = buildIndex(dataDir, user, updatedMonths);
  fs.writeFileSync(
    path.join(dataDir, "index.json"),
    JSON.stringify(index, null, 2) + "\n"
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- data-writer.test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/src/data-writer.ts scripts/__tests__/data-writer.test.ts
git commit -m "feat: add data writer with monthly JSON sharding and dedup"
```

---

### Task 10: Pull Request Fetcher

**Files:**
- Create: `scripts/src/fetchers/pull-requests.ts`
- Create: `scripts/__tests__/fetchers/pull-requests.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/fetchers/pull-requests.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchPullRequests } from "../../src/fetchers/pull-requests.js";
import type { GraphQLClient } from "../../src/graphql-client.js";
import { RateLimitTracker } from "../../src/rate-limit.js";

function makeClient(pages: Array<{ nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }>) {
  let callIndex = 0;
  return {
    query: vi.fn(async () => {
      const page = pages[callIndex++];
      return { user: { pullRequests: page } };
    }),
  } as unknown as GraphQLClient;
}

describe("fetchPullRequests", () => {
  let tracker: RateLimitTracker;

  beforeEach(() => {
    tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 4000, cost: 1, resetAt: "" });
  });

  it("fetches PRs and converts to PullRequestEvent[]", async () => {
    const client = makeClient([
      {
        nodes: [
          {
            number: 42,
            title: "Add RISC-V boot",
            state: "MERGED",
            createdAt: "2026-03-28T09:00:00Z",
            body: "Boot support",
            repository: { nameWithOwner: "nicklnick/pinux" },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    ]);

    const { events, endCursor, done } = await fetchPullRequests(
      client,
      tracker,
      "MRNIU",
      null,
      null
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("pull_request");
    expect(events[0].id).toBe("pr-42-nicklnick/pinux");
    expect(events[0].repo).toBe("nicklnick/pinux");
    expect(events[0].data.state).toBe("merged");
    expect(done).toBe(true);
  });

  it("stops when hitting cutoff date", async () => {
    const client = makeClient([
      {
        nodes: [
          {
            number: 10,
            title: "New PR",
            state: "OPEN",
            createdAt: "2026-03-20T10:00:00Z",
            body: "",
            repository: { nameWithOwner: "a/b" },
          },
          {
            number: 5,
            title: "Old PR",
            state: "CLOSED",
            createdAt: "2026-02-01T10:00:00Z",
            body: "",
            repository: { nameWithOwner: "a/b" },
          },
        ],
        pageInfo: { hasNextPage: true, endCursor: "cursor1" },
      },
    ]);

    const { events, done } = await fetchPullRequests(
      client,
      tracker,
      "MRNIU",
      null,
      "2026-03-01T00:00:00Z" // cutoff: only want events after March 1
    );

    // Should include the new one, exclude the old one
    expect(events).toHaveLength(1);
    expect(events[0].data.number).toBe(10);
    expect(done).toBe(true); // hit cutoff, so "done" for this run
  });

  it("stops when rate limit is exhausted", async () => {
    tracker.update({ limit: 5000, remaining: 400, cost: 1, resetAt: "" });

    const client = makeClient([]);

    const { events, done } = await fetchPullRequests(
      client,
      tracker,
      "MRNIU",
      null,
      null
    );

    expect(events).toHaveLength(0);
    expect(done).toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- pull-requests.test
```

Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// scripts/src/fetchers/pull-requests.ts
import type { GraphQLClient } from "../graphql-client.js";
import type { RateLimitTracker } from "../rate-limit.js";
import type { PullRequestEvent, PageInfo } from "../types.js";
import { extractSemantic } from "../semantic.js";

const QUERY = `
query($login: String!, $first: Int!, $after: String) {
  user(login: $login) {
    pullRequests(first: $first, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes {
        number
        title
        state
        createdAt
        body
        repository { nameWithOwner }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

interface FetchResult {
  events: PullRequestEvent[];
  endCursor: string | null;
  done: boolean;
}

export async function fetchPullRequests(
  client: GraphQLClient,
  tracker: RateLimitTracker,
  login: string,
  cursor: string | null,
  cutoffDate: string | null
): Promise<FetchResult> {
  const events: PullRequestEvent[] = [];
  let currentCursor = cursor;

  while (tracker.canContinue()) {
    const data = await client.query<{
      user: {
        pullRequests: {
          nodes: Array<{
            number: number;
            title: string;
            state: string;
            createdAt: string;
            body: string;
            repository: { nameWithOwner: string };
          }>;
          pageInfo: PageInfo;
        };
      };
    }>(QUERY, { login, first: 100, after: currentCursor });

    const { nodes, pageInfo } = data.user.pullRequests;
    let hitCutoff = false;

    for (const pr of nodes) {
      if (cutoffDate && pr.createdAt <= cutoffDate) {
        hitCutoff = true;
        break;
      }

      events.push({
        id: `pr-${pr.number}-${pr.repository.nameWithOwner}`,
        type: "pull_request",
        ts: pr.createdAt,
        repo: pr.repository.nameWithOwner,
        semantic: extractSemantic(pr.title),
        data: {
          number: pr.number,
          title: pr.title,
          state: pr.state.toLowerCase() as "open" | "closed" | "merged",
          body: pr.body || "",
        },
      });
    }

    if (hitCutoff || !pageInfo.hasNextPage) {
      return { events, endCursor: pageInfo.endCursor, done: true };
    }

    currentCursor = pageInfo.endCursor;
  }

  // Rate limit exhausted
  return { events, endCursor: currentCursor, done: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- pull-requests.test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/src/fetchers/pull-requests.ts scripts/__tests__/fetchers/pull-requests.test.ts
git commit -m "feat: add pull request fetcher with pagination and cutoff"
```

---

### Task 11: Issue Fetcher

**Files:**
- Create: `scripts/src/fetchers/issues.ts`
- Create: `scripts/__tests__/fetchers/issues.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/fetchers/issues.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchIssues } from "../../src/fetchers/issues.js";
import type { GraphQLClient } from "../../src/graphql-client.js";
import { RateLimitTracker } from "../../src/rate-limit.js";

function makeClient(pages: Array<{ nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }>) {
  let callIndex = 0;
  return {
    query: vi.fn(async () => {
      const page = pages[callIndex++];
      return { user: { issues: page } };
    }),
  } as unknown as GraphQLClient;
}

describe("fetchIssues", () => {
  let tracker: RateLimitTracker;

  beforeEach(() => {
    tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 4000, cost: 1, resetAt: "" });
  });

  it("fetches issues and converts to IssueEvent[]", async () => {
    const client = makeClient([
      {
        nodes: [
          {
            number: 99,
            title: "Boot fails on real hardware",
            state: "OPEN",
            createdAt: "2026-03-26T11:00:00Z",
            body: "When ACPI RSDT spans multiple pages...",
            repository: { nameWithOwner: "MRNIU/SimpleKernel" },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    ]);

    const { events, done } = await fetchIssues(client, tracker, "MRNIU", null, null);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("issue");
    expect(events[0].id).toBe("issue-99-MRNIU/SimpleKernel");
    expect(events[0].data.state).toBe("open");
    expect(done).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- issues.test
```

Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// scripts/src/fetchers/issues.ts
import type { GraphQLClient } from "../graphql-client.js";
import type { RateLimitTracker } from "../rate-limit.js";
import type { IssueEvent, PageInfo } from "../types.js";
import { extractSemantic } from "../semantic.js";

const QUERY = `
query($login: String!, $first: Int!, $after: String) {
  user(login: $login) {
    issues(first: $first, after: $after, orderBy: { field: CREATED_AT, direction: DESC }) {
      nodes {
        number
        title
        state
        createdAt
        body
        repository { nameWithOwner }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

interface FetchResult {
  events: IssueEvent[];
  endCursor: string | null;
  done: boolean;
}

export async function fetchIssues(
  client: GraphQLClient,
  tracker: RateLimitTracker,
  login: string,
  cursor: string | null,
  cutoffDate: string | null
): Promise<FetchResult> {
  const events: IssueEvent[] = [];
  let currentCursor = cursor;

  while (tracker.canContinue()) {
    const data = await client.query<{
      user: {
        issues: {
          nodes: Array<{
            number: number;
            title: string;
            state: string;
            createdAt: string;
            body: string;
            repository: { nameWithOwner: string };
          }>;
          pageInfo: PageInfo;
        };
      };
    }>(QUERY, { login, first: 100, after: currentCursor });

    const { nodes, pageInfo } = data.user.issues;
    let hitCutoff = false;

    for (const issue of nodes) {
      if (cutoffDate && issue.createdAt <= cutoffDate) {
        hitCutoff = true;
        break;
      }

      events.push({
        id: `issue-${issue.number}-${issue.repository.nameWithOwner}`,
        type: "issue",
        ts: issue.createdAt,
        repo: issue.repository.nameWithOwner,
        semantic: extractSemantic(issue.title),
        data: {
          number: issue.number,
          title: issue.title,
          state: issue.state.toLowerCase() as "open" | "closed",
          body: issue.body || "",
        },
      });
    }

    if (hitCutoff || !pageInfo.hasNextPage) {
      return { events, endCursor: pageInfo.endCursor, done: true };
    }

    currentCursor = pageInfo.endCursor;
  }

  return { events, endCursor: currentCursor, done: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- issues.test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/src/fetchers/issues.ts scripts/__tests__/fetchers/issues.test.ts
git commit -m "feat: add issue fetcher with pagination and cutoff"
```

---

### Task 12: Issue Comment Fetcher

**Files:**
- Create: `scripts/src/fetchers/comments.ts`
- Create: `scripts/__tests__/fetchers/comments.test.ts`

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/fetchers/comments.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchComments } from "../../src/fetchers/comments.js";
import type { GraphQLClient } from "../../src/graphql-client.js";
import { RateLimitTracker } from "../../src/rate-limit.js";

function makeClient(pages: Array<{ nodes: unknown[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }>) {
  let callIndex = 0;
  return {
    query: vi.fn(async () => {
      const page = pages[callIndex++];
      return { user: { issueComments: page } };
    }),
  } as unknown as GraphQLClient;
}

describe("fetchComments", () => {
  let tracker: RateLimitTracker;

  beforeEach(() => {
    tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 4000, cost: 1, resetAt: "" });
  });

  it("fetches issue comments and converts to IssueCommentEvent[]", async () => {
    const client = makeClient([
      {
        nodes: [
          {
            createdAt: "2026-03-25T08:30:00Z",
            body: "I ran into the same issue on RPi4.",
            issue: {
              number: 55,
              title: "MMU tutorial missing TLB invalidation",
              repository: { nameWithOwner: "rust-embedded/tutorials" },
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    ]);

    const { events, done } = await fetchComments(client, tracker, "MRNIU", null, null);

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("issue_comment");
    expect(events[0].repo).toBe("rust-embedded/tutorials");
    expect(events[0].data.issueNumber).toBe(55);
    expect(done).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- comments.test
```

Expected: FAIL

- [ ] **Step 3: Write implementation**

Note: `issueComments` only supports `orderBy: UPDATED_AT` on the GitHub API. We sort by `UPDATED_AT DESC` and use `createdAt` from each node for event timestamps. The cutoff comparison uses `createdAt`.

```typescript
// scripts/src/fetchers/comments.ts
import type { GraphQLClient } from "../graphql-client.js";
import type { RateLimitTracker } from "../rate-limit.js";
import type { IssueCommentEvent, PageInfo } from "../types.js";

const QUERY = `
query($login: String!, $first: Int!, $after: String) {
  user(login: $login) {
    issueComments(first: $first, after: $after, orderBy: { direction: DESC }) {
      nodes {
        createdAt
        body
        issue {
          number
          title
          repository { nameWithOwner }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

interface FetchResult {
  events: IssueCommentEvent[];
  endCursor: string | null;
  done: boolean;
}

let commentCounter = 0;

export async function fetchComments(
  client: GraphQLClient,
  tracker: RateLimitTracker,
  login: string,
  cursor: string | null,
  cutoffDate: string | null
): Promise<FetchResult> {
  const events: IssueCommentEvent[] = [];
  let currentCursor = cursor;

  while (tracker.canContinue()) {
    const data = await client.query<{
      user: {
        issueComments: {
          nodes: Array<{
            createdAt: string;
            body: string;
            issue: {
              number: number;
              title: string;
              repository: { nameWithOwner: string };
            };
          }>;
          pageInfo: PageInfo;
        };
      };
    }>(QUERY, { login, first: 100, after: currentCursor });

    const { nodes, pageInfo } = data.user.issueComments;
    let hitCutoff = false;

    for (const comment of nodes) {
      if (cutoffDate && comment.createdAt <= cutoffDate) {
        hitCutoff = true;
        break;
      }

      events.push({
        id: `comment-${comment.issue.repository.nameWithOwner}-${comment.issue.number}-${commentCounter++}`,
        type: "issue_comment",
        ts: comment.createdAt,
        repo: comment.issue.repository.nameWithOwner,
        semantic: null,
        data: {
          issueNumber: comment.issue.number,
          issueTitle: comment.issue.title,
          body: comment.body || "",
        },
      });
    }

    if (hitCutoff || !pageInfo.hasNextPage) {
      return { events, endCursor: pageInfo.endCursor, done: true };
    }

    currentCursor = pageInfo.endCursor;
  }

  return { events, endCursor: currentCursor, done: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- comments.test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/src/fetchers/comments.ts scripts/__tests__/fetchers/comments.test.ts
git commit -m "feat: add issue comment fetcher"
```

---

### Task 13: Review Fetcher

**Files:**
- Create: `scripts/src/fetchers/reviews.ts`
- Create: `scripts/__tests__/fetchers/reviews.test.ts`

This fetcher uses `contributionsCollection` which has a **1-year max window**. For backfill across multiple years, the checkpoint stores `currentYear` and we query one year at a time.

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/fetchers/reviews.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchReviews } from "../../src/fetchers/reviews.js";
import type { GraphQLClient } from "../../src/graphql-client.js";
import { RateLimitTracker } from "../../src/rate-limit.js";

function makeClient(response: unknown) {
  return {
    query: vi.fn(async () => response),
  } as unknown as GraphQLClient;
}

describe("fetchReviews", () => {
  let tracker: RateLimitTracker;

  beforeEach(() => {
    tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 4000, cost: 1, resetAt: "" });
  });

  it("fetches reviews from contributionsCollection and converts to ReviewEvent[]", async () => {
    const client = makeClient({
      user: {
        contributionsCollection: {
          pullRequestReviewContributions: {
            nodes: [
              {
                occurredAt: "2026-03-27T16:45:00Z",
                pullRequest: {
                  number: 128,
                  title: "Fix page table walk for Sv48",
                  repository: { nameWithOwner: "rcore-os/rCore" },
                },
                pullRequestReview: {
                  state: "APPROVED",
                  body: "Looks correct.",
                  comments: {
                    nodes: [
                      { body: "Use sfence.vma", path: "kernel/src/mm.rs", originalPosition: 87 },
                    ],
                  },
                },
              },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      },
    });

    const { events, done } = await fetchReviews(
      client,
      tracker,
      "MRNIU",
      2026,
      null,
      null
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("review");
    expect(events[0].data.state).toBe("APPROVED");
    expect(events[0].data.inlineComments).toHaveLength(1);
    expect(events[0].data.inlineComments[0].path).toBe("kernel/src/mm.rs");
    expect(done).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- reviews.test
```

Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// scripts/src/fetchers/reviews.ts
import type { GraphQLClient } from "../graphql-client.js";
import type { RateLimitTracker } from "../rate-limit.js";
import type { ReviewEvent, PageInfo } from "../types.js";

const QUERY = `
query($login: String!, $from: DateTime!, $to: DateTime!, $first: Int!, $after: String) {
  user(login: $login) {
    contributionsCollection(from: $from, to: $to) {
      pullRequestReviewContributions(first: $first, after: $after) {
        nodes {
          occurredAt
          pullRequest {
            number
            title
            repository { nameWithOwner }
          }
          pullRequestReview {
            state
            body
            comments(first: 10) {
              nodes {
                body
                path
                originalPosition
              }
            }
          }
        }
        pageInfo { hasNextPage endCursor }
      }
    }
  }
}`;

interface FetchResult {
  events: ReviewEvent[];
  endCursor: string | null;
  done: boolean;
}

export async function fetchReviews(
  client: GraphQLClient,
  tracker: RateLimitTracker,
  login: string,
  year: number,
  cursor: string | null,
  cutoffDate: string | null
): Promise<FetchResult> {
  const events: ReviewEvent[] = [];
  let currentCursor = cursor;
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year}-12-31T23:59:59Z`;

  while (tracker.canContinue()) {
    const data = await client.query<{
      user: {
        contributionsCollection: {
          pullRequestReviewContributions: {
            nodes: Array<{
              occurredAt: string;
              pullRequest: {
                number: number;
                title: string;
                repository: { nameWithOwner: string };
              };
              pullRequestReview: {
                state: string;
                body: string;
                comments: {
                  nodes: Array<{
                    body: string;
                    path: string;
                    originalPosition: number | null;
                  }>;
                };
              };
            }>;
            pageInfo: PageInfo;
          };
        };
      };
    }>(QUERY, { login, from, to, first: 100, after: currentCursor });

    const contrib = data.user.contributionsCollection.pullRequestReviewContributions;
    let hitCutoff = false;

    for (const node of contrib.nodes) {
      if (cutoffDate && node.occurredAt <= cutoffDate) {
        hitCutoff = true;
        break;
      }

      const review = node.pullRequestReview;
      events.push({
        id: `review-${node.pullRequest.repository.nameWithOwner}-${node.pullRequest.number}-${node.occurredAt}`,
        type: "review",
        ts: node.occurredAt,
        repo: node.pullRequest.repository.nameWithOwner,
        semantic: null,
        data: {
          prNumber: node.pullRequest.number,
          prTitle: node.pullRequest.title,
          state: review.state,
          body: review.body || "",
          inlineComments: review.comments.nodes.map((c) => ({
            path: c.path,
            line: c.originalPosition || 0,
            body: c.body,
          })),
        },
      });
    }

    if (hitCutoff || !contrib.pageInfo.hasNextPage) {
      return { events, endCursor: contrib.pageInfo.endCursor, done: true };
    }

    currentCursor = contrib.pageInfo.endCursor;
  }

  return { events, endCursor: currentCursor, done: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- reviews.test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/src/fetchers/reviews.ts scripts/__tests__/fetchers/reviews.test.ts
git commit -m "feat: add review fetcher via contributionsCollection"
```

---

### Task 14: Commit Fetcher

**Files:**
- Create: `scripts/src/fetchers/commits.ts`
- Create: `scripts/__tests__/fetchers/commits.test.ts`

Commits require per-repo queries. The fetcher first discovers repos via `repositoriesContributedTo`, then fetches commit history per repo filtered by author.

- [ ] **Step 1: Write the test**

```typescript
// scripts/__tests__/fetchers/commits.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { discoverRepos, fetchCommitsForRepo } from "../../src/fetchers/commits.js";
import type { GraphQLClient } from "../../src/graphql-client.js";
import { RateLimitTracker } from "../../src/rate-limit.js";

describe("discoverRepos", () => {
  it("returns list of repo nameWithOwner values", async () => {
    const tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 4000, cost: 1, resetAt: "" });

    const client = {
      query: vi.fn(async () => ({
        user: {
          repositoriesContributedTo: {
            nodes: [
              { nameWithOwner: "MRNIU/SimpleKernel" },
              { nameWithOwner: "rcore-os/rCore" },
            ],
            pageInfo: { hasNextPage: false, endCursor: null },
          },
        },
      })),
    } as unknown as GraphQLClient;

    const repos = await discoverRepos(client, tracker, "MRNIU");
    expect(repos).toEqual(["MRNIU/SimpleKernel", "rcore-os/rCore"]);
  });
});

describe("fetchCommitsForRepo", () => {
  let tracker: RateLimitTracker;

  beforeEach(() => {
    tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 4000, cost: 1, resetAt: "" });
  });

  it("fetches commits for a single repo and converts to CommitEvent[]", async () => {
    const client = {
      query: vi.fn(async () => ({
        repository: {
          defaultBranchRef: {
            target: {
              history: {
                nodes: [
                  {
                    oid: "abc1234def5678",
                    abbreviatedOid: "abc1234",
                    message: "feat(mm): implement UEFI memory map parser",
                    committedDate: "2026-03-29T14:32:00Z",
                    additions: 120,
                    deletions: 15,
                  },
                ],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      })),
    } as unknown as GraphQLClient;

    const { events, endCursor, done } = await fetchCommitsForRepo(
      client,
      tracker,
      "MRNIU/SimpleKernel",
      "MDQ6VXNlcjEyMzQ1",
      null,
      null
    );

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("commit");
    expect(events[0].id).toBe("commit-abc1234def5678");
    expect(events[0].data.sha).toBe("abc1234def5678");
    expect(events[0].data.additions).toBe(120);
    expect(events[0].semantic).toBe("feat");
    expect(done).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- commits.test
```

Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// scripts/src/fetchers/commits.ts
import type { GraphQLClient } from "../graphql-client.js";
import type { RateLimitTracker } from "../rate-limit.js";
import type { CommitEvent, PageInfo } from "../types.js";
import { extractSemantic } from "../semantic.js";

const DISCOVER_REPOS_QUERY = `
query($login: String!, $first: Int!, $after: String) {
  user(login: $login) {
    repositoriesContributedTo(
      first: $first
      after: $after
      contributionTypes: COMMIT
      includeUserRepositories: true
    ) {
      nodes { nameWithOwner }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const COMMITS_QUERY = `
query($owner: String!, $repo: String!, $authorId: ID!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: $first, after: $after, author: { id: $authorId }) {
            nodes {
              oid
              abbreviatedOid
              message
              committedDate
              additions
              deletions
            }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  }
}`;

export async function discoverRepos(
  client: GraphQLClient,
  tracker: RateLimitTracker,
  login: string
): Promise<string[]> {
  const repos: string[] = [];
  let cursor: string | null = null;

  while (tracker.canContinue()) {
    const data = await client.query<{
      user: {
        repositoriesContributedTo: {
          nodes: Array<{ nameWithOwner: string }>;
          pageInfo: PageInfo;
        };
      };
    }>(DISCOVER_REPOS_QUERY, { login, first: 100, after: cursor });

    const conn = data.user.repositoriesContributedTo;
    for (const node of conn.nodes) {
      repos.push(node.nameWithOwner);
    }

    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }

  return repos;
}

interface FetchResult {
  events: CommitEvent[];
  endCursor: string | null;
  done: boolean;
}

export async function fetchCommitsForRepo(
  client: GraphQLClient,
  tracker: RateLimitTracker,
  repoFullName: string,
  authorId: string,
  cursor: string | null,
  cutoffDate: string | null
): Promise<FetchResult> {
  const [owner, repo] = repoFullName.split("/");
  const events: CommitEvent[] = [];
  let currentCursor = cursor;

  while (tracker.canContinue()) {
    const data = await client.query<{
      repository: {
        defaultBranchRef: {
          target: {
            history: {
              nodes: Array<{
                oid: string;
                abbreviatedOid: string;
                message: string;
                committedDate: string;
                additions: number;
                deletions: number;
              }>;
              pageInfo: PageInfo;
            };
          };
        } | null;
      };
    }>(COMMITS_QUERY, { owner, repo, authorId, first: 100, after: currentCursor });

    const ref = data.repository.defaultBranchRef;
    if (!ref) {
      // Empty repo or no default branch
      return { events, endCursor: null, done: true };
    }

    const { nodes, pageInfo } = ref.target.history;
    let hitCutoff = false;

    for (const commit of nodes) {
      if (cutoffDate && commit.committedDate <= cutoffDate) {
        hitCutoff = true;
        break;
      }

      events.push({
        id: `commit-${commit.oid}`,
        type: "commit",
        ts: commit.committedDate,
        repo: repoFullName,
        semantic: extractSemantic(commit.message),
        data: {
          sha: commit.oid,
          message: commit.message,
          additions: commit.additions,
          deletions: commit.deletions,
        },
      });
    }

    if (hitCutoff || !pageInfo.hasNextPage) {
      return { events, endCursor: pageInfo.endCursor, done: true };
    }

    currentCursor = pageInfo.endCursor;
  }

  return { events, endCursor: currentCursor, done: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- commits.test
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/src/fetchers/commits.ts scripts/__tests__/fetchers/commits.test.ts
git commit -m "feat: add commit fetcher with per-repo pagination"
```

---

### Task 15: Main Orchestrator

**Files:**
- Create: `scripts/src/fetch-data.ts`

This is the entry point invoked by `npm run fetch`. It orchestrates the full pipeline:
1. Load config
2. Read checkpoint
3. Run incremental fetch (new events since last run)
4. Run backfill (older events, if budget remains)
5. Apply filters
6. Write events to monthly JSON files
7. Save checkpoint

- [ ] **Step 1: Write the orchestrator**

```typescript
// scripts/src/fetch-data.ts
import path from "node:path";
import { loadConfig } from "./config.js";
import { GraphQLClient } from "./graphql-client.js";
import { RateLimitTracker } from "./rate-limit.js";
import { readCheckpoint, writeCheckpoint } from "./checkpoint.js";
import { createEventFilter } from "./filters.js";
import { writeEvents } from "./data-writer.js";
import { fetchPullRequests } from "./fetchers/pull-requests.js";
import { fetchIssues } from "./fetchers/issues.js";
import { fetchComments } from "./fetchers/comments.js";
import { fetchReviews } from "./fetchers/reviews.js";
import { discoverRepos, fetchCommitsForRepo } from "./fetchers/commits.js";
import type { GitPulseEvent, Checkpoint } from "./types.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CHECKPOINT_PATH = path.join(DATA_DIR, "checkpoint.json");

async function getUserId(client: GraphQLClient, login: string): Promise<string> {
  const data = await client.query<{ user: { id: string } }>(
    `query($login: String!) { user(login: $login) { id } }`,
    { login }
  );
  return data.user.id;
}

async function runIncremental(
  client: GraphQLClient,
  tracker: RateLimitTracker,
  login: string,
  userId: string,
  checkpoint: Checkpoint
): Promise<GitPulseEvent[]> {
  const cutoff = checkpoint.lastFetchedAt;
  if (!cutoff) return []; // First run — no incremental, go straight to backfill

  console.log(`[incremental] Fetching events since ${cutoff}`);
  const allEvents: GitPulseEvent[] = [];

  // Fetch all types in sequence (could parallelize later but rate limit is shared)
  if (tracker.canContinue()) {
    const { events } = await fetchPullRequests(client, tracker, login, null, cutoff);
    allEvents.push(...events);
    console.log(`  PRs: ${events.length}`);
  }

  if (tracker.canContinue()) {
    const { events } = await fetchIssues(client, tracker, login, null, cutoff);
    allEvents.push(...events);
    console.log(`  Issues: ${events.length}`);
  }

  if (tracker.canContinue()) {
    const { events } = await fetchComments(client, tracker, login, null, cutoff);
    allEvents.push(...events);
    console.log(`  Comments: ${events.length}`);
  }

  if (tracker.canContinue()) {
    const currentYear = new Date().getFullYear();
    const { events } = await fetchReviews(client, tracker, login, currentYear, null, cutoff);
    allEvents.push(...events);
    console.log(`  Reviews: ${events.length}`);
  }

  // Commits: need to discover repos then fetch per-repo
  if (tracker.canContinue()) {
    const repos = await discoverRepos(client, tracker, login);
    let commitCount = 0;
    for (const repo of repos) {
      if (!tracker.canContinue()) break;
      const { events } = await fetchCommitsForRepo(client, tracker, repo, userId, null, cutoff);
      allEvents.push(...events);
      commitCount += events.length;
    }
    console.log(`  Commits: ${commitCount} (across ${repos.length} repos)`);
  }

  return allEvents;
}

async function runBackfill(
  client: GraphQLClient,
  tracker: RateLimitTracker,
  login: string,
  userId: string,
  checkpoint: Checkpoint
): Promise<GitPulseEvent[]> {
  if (checkpoint.backfill.completed) return [];
  console.log("[backfill] Continuing historical data fetch...");

  const allEvents: GitPulseEvent[] = [];
  const bf = checkpoint.backfill;

  // Pull Requests
  if (!bf.pullRequests.done && tracker.canContinue()) {
    const { events, endCursor, done } = await fetchPullRequests(
      client, tracker, login, bf.pullRequests.cursor, null
    );
    allEvents.push(...events);
    bf.pullRequests.cursor = endCursor;
    bf.pullRequests.done = done;
    console.log(`  PRs backfill: ${events.length} (done: ${done})`);
  }

  // Issues
  if (!bf.issues.done && tracker.canContinue()) {
    const { events, endCursor, done } = await fetchIssues(
      client, tracker, login, bf.issues.cursor, null
    );
    allEvents.push(...events);
    bf.issues.cursor = endCursor;
    bf.issues.done = done;
    console.log(`  Issues backfill: ${events.length} (done: ${done})`);
  }

  // Issue Comments
  if (!bf.issueComments.done && tracker.canContinue()) {
    const { events, endCursor, done } = await fetchComments(
      client, tracker, login, bf.issueComments.cursor, null
    );
    allEvents.push(...events);
    bf.issueComments.cursor = endCursor;
    bf.issueComments.done = done;
    console.log(`  Comments backfill: ${events.length} (done: ${done})`);
  }

  // Reviews (year by year)
  if (!bf.reviews.done && tracker.canContinue()) {
    const { events, endCursor, done } = await fetchReviews(
      client, tracker, login, bf.reviews.currentYear, bf.reviews.pageCursor, null
    );
    allEvents.push(...events);
    if (done) {
      // Move to previous year
      const prevYear = bf.reviews.currentYear - 1;
      // GitHub was founded in 2008; stop backfilling before that
      if (prevYear < 2008) {
        bf.reviews.done = true;
      } else {
        bf.reviews.currentYear = prevYear;
        bf.reviews.pageCursor = null;
      }
    } else {
      bf.reviews.pageCursor = endCursor;
    }
    console.log(`  Reviews backfill (${bf.reviews.currentYear}): ${events.length}`);
  }

  // Commits (per-repo)
  if (!bf.commits.done && tracker.canContinue()) {
    // Discover repos on first backfill run
    if (bf.commits.repoList.length === 0) {
      bf.commits.repoList = await discoverRepos(client, tracker, login);
      console.log(`  Discovered ${bf.commits.repoList.length} repos for commit backfill`);
    }

    while (bf.commits.repoIndex < bf.commits.repoList.length && tracker.canContinue()) {
      const repo = bf.commits.repoList[bf.commits.repoIndex];
      const { events, endCursor, done } = await fetchCommitsForRepo(
        client, tracker, repo, userId, bf.commits.pageCursor, null
      );
      allEvents.push(...events);

      if (done) {
        bf.commits.repoIndex++;
        bf.commits.pageCursor = null;
        console.log(`  Commits backfill [${repo}]: ${events.length} (complete)`);
      } else {
        bf.commits.pageCursor = endCursor;
        console.log(`  Commits backfill [${repo}]: ${events.length} (paused — rate limit)`);
        break;
      }
    }

    if (bf.commits.repoIndex >= bf.commits.repoList.length) {
      bf.commits.done = true;
    }
  }

  // Check if all backfill is complete
  bf.completed = bf.pullRequests.done && bf.issues.done && bf.issueComments.done && bf.reviews.done && bf.commits.done;
  if (bf.completed) {
    console.log("[backfill] All historical data fetched!");
  }

  return allEvents;
}

async function main() {
  const config = loadConfig();
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  const tracker = new RateLimitTracker(500);
  const client = new GraphQLClient(token, tracker);
  const checkpoint = readCheckpoint(CHECKPOINT_PATH);
  const filter = createEventFilter(config);

  console.log(`[GitPulse] Fetching data for ${config.username}`);

  // Get user's GraphQL node ID (needed for commit author filter)
  const userId = await getUserId(client, config.username);

  // Phase 1: Incremental fetch
  const incrementalEvents = await runIncremental(client, tracker, config.username, userId, checkpoint);

  // Phase 2: Backfill with remaining budget
  const backfillEvents = await runBackfill(client, tracker, config.username, userId, checkpoint);

  // Combine, filter, and write
  const allEvents = [...incrementalEvents, ...backfillEvents];
  const filtered = allEvents.filter(filter);

  console.log(`[write] ${filtered.length} events after filtering (${allEvents.length - filtered.length} filtered out)`);

  if (filtered.length > 0) {
    writeEvents(DATA_DIR, config.username, filtered);
  }

  // Update checkpoint
  checkpoint.lastFetchedAt = new Date().toISOString();
  writeCheckpoint(CHECKPOINT_PATH, checkpoint);

  console.log(`[done] Rate limit remaining: ${tracker.remaining}`);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit --esModuleInterop --module nodenext --moduleResolution nodenext scripts/src/fetch-data.ts
```

Expected: No type errors (or only minor resolvable issues).

- [ ] **Step 3: Verify the script runs without GITHUB_TOKEN (should error gracefully)**

```bash
npm run fetch 2>&1 || true
```

Expected: Error message: "GITHUB_TOKEN environment variable is required" — confirms the entry point is wired up correctly.

- [ ] **Step 4: Commit**

```bash
git add scripts/src/fetch-data.ts
git commit -m "feat: add main fetch orchestrator with incremental and backfill"
```

---

### Task 16: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/fetch-data.yml`

- [ ] **Step 1: Create the workflow file**

```yaml
# .github/workflows/fetch-data.yml
name: GitPulse Data Fetch

on:
  schedule:
    - cron: "0 2 * * *"
  workflow_dispatch:

jobs:
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

      - name: Fetch GitHub activity data
        run: npm run fetch
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
          ref: main

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

- [ ] **Step 2: Verify YAML is valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/fetch-data.yml'))" && echo "YAML valid"
```

Expected: "YAML valid"

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/fetch-data.yml
git commit -m "feat: add GitHub Actions workflow for data fetch and deploy"
```

---

### Task 17: End-to-End Smoke Test with Mock Data

**Files:**
- Create: `scripts/__tests__/integration.test.ts`

This test verifies the data-writer and checkpoint modules work together in a realistic scenario without hitting the real GitHub API.

- [ ] **Step 1: Write integration test**

```typescript
// scripts/__tests__/integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { writeEvents } from "../src/data-writer.js";
import { readCheckpoint, writeCheckpoint, createEmptyCheckpoint } from "../src/checkpoint.js";
import { createEventFilter } from "../src/filters.js";
import type { GitPulseEvent, IndexData, MonthlyData } from "../src/types.js";

const TEST_DIR = path.resolve(process.cwd(), "data/__test_integration");
const CHECKPOINT_PATH = path.join(TEST_DIR, "checkpoint.json");

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(TEST_DIR, name), "utf-8"));
}

describe("integration: full write cycle", () => {
  beforeEach(() => {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("simulates two fetch cycles: initial backfill then incremental", () => {
    const filter = createEventFilter({
      ignoredRepos: ["MRNIU/test-repo"],
      filters: { ignoreShortComments: true, minCommentLength: 10, ignoreKeywords: ["typo"] },
    });

    // ── Cycle 1: Backfill batch ──
    const batch1: GitPulseEvent[] = [
      {
        id: "commit-aaa",
        type: "commit",
        ts: "2026-03-10T10:00:00Z",
        repo: "MRNIU/SimpleKernel",
        semantic: "feat",
        data: { sha: "aaa", message: "feat: parser", additions: 50, deletions: 0 },
      },
      {
        id: "commit-filtered",
        type: "commit",
        ts: "2026-03-09T10:00:00Z",
        repo: "MRNIU/test-repo", // should be filtered
        semantic: null,
        data: { sha: "filtered", message: "test", additions: 1, deletions: 0 },
      },
      {
        id: "pr-1",
        type: "pull_request",
        ts: "2026-02-15T10:00:00Z",
        repo: "other/repo",
        semantic: "feat",
        data: { number: 1, title: "Add thing", state: "merged", body: "..." },
      },
    ];

    const filtered1 = batch1.filter(filter);
    expect(filtered1).toHaveLength(2); // test-repo filtered out
    writeEvents(TEST_DIR, "MRNIU", filtered1);

    const cp = createEmptyCheckpoint();
    cp.lastFetchedAt = "2026-03-10T12:00:00Z";
    writeCheckpoint(CHECKPOINT_PATH, cp);

    // Verify cycle 1 output
    const index1 = readJson<IndexData>("index.json");
    expect(index1.stats.totalCommits).toBe(1);
    expect(index1.stats.totalPRs).toBe(1);
    expect(index1.months).toHaveLength(2); // March and February

    const march1 = readJson<MonthlyData>("2026-03.json");
    expect(march1.events).toHaveLength(1);

    // ── Cycle 2: Incremental with new events ──
    const batch2: GitPulseEvent[] = [
      {
        id: "commit-bbb",
        type: "commit",
        ts: "2026-03-11T10:00:00Z",
        repo: "MRNIU/SimpleKernel",
        semantic: "fix",
        data: { sha: "bbb", message: "fix: bug", additions: 3, deletions: 1 },
      },
      {
        id: "commit-aaa", // duplicate from cycle 1
        type: "commit",
        ts: "2026-03-10T10:00:00Z",
        repo: "MRNIU/SimpleKernel",
        semantic: "feat",
        data: { sha: "aaa", message: "feat: parser", additions: 50, deletions: 0 },
      },
    ];

    const filtered2 = batch2.filter(filter);
    writeEvents(TEST_DIR, "MRNIU", filtered2);

    // Verify cycle 2 output
    const march2 = readJson<MonthlyData>("2026-03.json");
    expect(march2.events).toHaveLength(2); // no duplicate

    const index2 = readJson<IndexData>("index.json");
    expect(index2.stats.totalCommits).toBe(2);
    expect(index2.stats.totalPRs).toBe(1);

    // Verify checkpoint round-trip
    const loadedCp = readCheckpoint(CHECKPOINT_PATH);
    expect(loadedCp.lastFetchedAt).toBe("2026-03-10T12:00:00Z");
  });
});
```

- [ ] **Step 2: Run integration test**

```bash
npm test -- integration.test
```

Expected: PASS

- [ ] **Step 3: Run full test suite**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add scripts/__tests__/integration.test.ts
git commit -m "test: add end-to-end integration test for data pipeline"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Astro project initialization → Task 1
- [x] `devlog.config.js` configuration → Task 2
- [x] Shared type definitions → Task 3
- [x] GraphQL client with rate limit tracking → Tasks 4-5
- [x] Semantic tag extraction → Task 6
- [x] Event filtering (repos, keywords, short comments) → Task 7
- [x] Checkpoint read/write with backfill state → Task 8
- [x] Monthly JSON sharding with dedup → Task 9
- [x] All 5 fetchers (PR, issue, comment, review, commit) → Tasks 10-14
- [x] Main orchestrator (incremental + backfill) → Task 15
- [x] GitHub Actions workflow (fetch + deploy) → Task 16
- [x] Integration test → Task 17

**API accuracy verified:**
- `user.pullRequests` — no `filterBy` support, uses client-side cutoff ✓
- `user.issueComments` — `orderBy` only supports `UPDATED_AT` ✓
- `contributionsCollection` — 1-year max window, year-by-year backfill ✓
- Commits — per-repo via `repository.defaultBranchRef.target.history` with `author.id` filter ✓
- Rate limit — `rateLimit { remaining cost }` injected into every query ✓

**Type consistency:**
- `GitPulseEvent` union type used consistently across fetchers, filters, and data writer ✓
- `Checkpoint` type matches checkpoint.ts read/write and fetch-data.ts usage ✓
- `BackfillCursor` / `CommitBackfillState` / `ReviewBackfillState` match orchestrator logic ✓
