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
  repoBreakdown: Record<string, number>;
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
  cursor: string | null;
  done: boolean;
}

export interface CommitBackfillState {
  repoList: string[];
  repoIndex: number;
  pageCursor: string | null;
  done: boolean;
}

export interface ReviewBackfillState {
  currentYear: number;
  pageCursor: string | null;
  done: boolean;
}

export interface Checkpoint {
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
