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
        user: { repositoriesContributedTo: {
          nodes: [{ nameWithOwner: "MRNIU/SimpleKernel" }, { nameWithOwner: "rcore-os/rCore" }],
          pageInfo: { hasNextPage: false, endCursor: null },
        }},
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

  it("fetches commits for a single repo", async () => {
    const client = {
      query: vi.fn(async () => ({
        repository: { defaultBranchRef: { target: { history: {
          nodes: [{ oid: "abc1234def5678", abbreviatedOid: "abc1234",
            message: "feat(mm): implement UEFI memory map parser",
            committedDate: "2026-03-29T14:32:00Z", additions: 120, deletions: 15 }],
          pageInfo: { hasNextPage: false, endCursor: null },
        }}}},
      })),
    } as unknown as GraphQLClient;
    const { events, done } = await fetchCommitsForRepo(client, tracker, "MRNIU/SimpleKernel", "MDQ6VXNlcjEyMzQ1", null, null);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("commit");
    expect(events[0].id).toBe("commit-abc1234def5678");
    expect(events[0].data.sha).toBe("abc1234def5678");
    expect(events[0].data.additions).toBe(120);
    expect(events[0].semantic).toBe("feat");
    expect(done).toBe(true);
  });
});
