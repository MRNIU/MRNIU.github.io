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
    const client = makeClient([{
      nodes: [{
        number: 42, title: "Add RISC-V boot", state: "MERGED",
        createdAt: "2026-03-28T09:00:00Z", body: "Boot support",
        repository: { nameWithOwner: "nicklnick/pinux" },
      }],
      pageInfo: { hasNextPage: false, endCursor: null },
    }]);
    const { events, done } = await fetchPullRequests(client, tracker, "MRNIU", null, null);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("pull_request");
    expect(events[0].id).toBe("pr-42-nicklnick/pinux");
    expect(events[0].data.state).toBe("merged");
    expect(done).toBe(true);
  });

  it("stops when hitting cutoff date", async () => {
    const client = makeClient([{
      nodes: [
        { number: 10, title: "New PR", state: "OPEN", createdAt: "2026-03-20T10:00:00Z", body: "", repository: { nameWithOwner: "a/b" } },
        { number: 5, title: "Old PR", state: "CLOSED", createdAt: "2026-02-01T10:00:00Z", body: "", repository: { nameWithOwner: "a/b" } },
      ],
      pageInfo: { hasNextPage: true, endCursor: "cursor1" },
    }]);
    const { events, done } = await fetchPullRequests(client, tracker, "MRNIU", null, "2026-03-01T00:00:00Z");
    expect(events).toHaveLength(1);
    expect(events[0].data.number).toBe(10);
    expect(done).toBe(true);
  });

  it("stops when rate limit is exhausted", async () => {
    tracker.update({ limit: 5000, remaining: 400, cost: 1, resetAt: "" });
    const client = makeClient([]);
    const { events, done } = await fetchPullRequests(client, tracker, "MRNIU", null, null);
    expect(events).toHaveLength(0);
    expect(done).toBe(false);
    expect(client.query).not.toHaveBeenCalled();
  });
});
