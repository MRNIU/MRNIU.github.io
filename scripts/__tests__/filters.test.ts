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
      id: "commit-abc", type: "commit", ts: "2026-03-29T14:00:00Z",
      repo: "MRNIU/SimpleKernel", semantic: "feat",
      data: { sha: "abc", message: "feat: add parser", additions: 10, deletions: 0 },
    };
    expect(filter(event)).toBe(true);
  });

  it("filters events from ignored repos", () => {
    const event: CommitEvent = {
      id: "commit-xyz", type: "commit", ts: "2026-03-29T14:00:00Z",
      repo: "MRNIU/test-repo", semantic: null,
      data: { sha: "xyz", message: "test", additions: 1, deletions: 0 },
    };
    expect(filter(event)).toBe(false);
  });

  it("filters commits matching ignored keywords", () => {
    const event: CommitEvent = {
      id: "commit-wip", type: "commit", ts: "2026-03-29T14:00:00Z",
      repo: "MRNIU/SimpleKernel", semantic: null,
      data: { sha: "wip1", message: "WIP", additions: 1, deletions: 0 },
    };
    expect(filter(event)).toBe(false);
  });

  it("filters short comments when enabled", () => {
    const event: IssueCommentEvent = {
      id: "comment-short", type: "issue_comment", ts: "2026-03-29T14:00:00Z",
      repo: "MRNIU/SimpleKernel", semantic: null,
      data: { issueNumber: 1, issueTitle: "Bug", body: "LGTM" },
    };
    expect(filter(event)).toBe(false);
  });

  it("keeps comments above minimum length", () => {
    const event: IssueCommentEvent = {
      id: "comment-long", type: "issue_comment", ts: "2026-03-29T14:00:00Z",
      repo: "MRNIU/SimpleKernel", semantic: null,
      data: { issueNumber: 1, issueTitle: "Bug", body: "This is a detailed comment about the issue." },
    };
    expect(filter(event)).toBe(true);
  });

  it("always keeps ai_roast events", () => {
    const event = {
      id: "ai-roast-1", type: "ai_roast" as const, ts: "2026-03-29T00:00:00Z",
      repo: null, semantic: null,
      data: { weekRange: "", content: "", stats: { totalCommits: 0, topRepo: "" } },
    };
    expect(filter(event)).toBe(true);
  });
});
