import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchComments } from "../../src/fetchers/comments.js";
import type { GraphQLClient } from "../../src/graphql-client.js";
import { RateLimitTracker } from "../../src/rate-limit.js";

describe("fetchComments", () => {
  let tracker: RateLimitTracker;
  beforeEach(() => {
    tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 4000, cost: 1, resetAt: "" });
  });

  it("fetches issue comments and converts to IssueCommentEvent[]", async () => {
    const client = {
      query: vi.fn(async () => ({
        user: { issueComments: {
          nodes: [{ createdAt: "2026-03-25T08:30:00Z", body: "I ran into the same issue on RPi4.",
            issue: { number: 55, title: "MMU tutorial missing TLB invalidation", repository: { nameWithOwner: "rust-embedded/tutorials" } } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        }},
      })),
    } as unknown as GraphQLClient;
    const { events, done } = await fetchComments(client, tracker, "MRNIU", null, null);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("issue_comment");
    expect(events[0].repo).toBe("rust-embedded/tutorials");
    expect(events[0].data.issueNumber).toBe(55);
    expect(done).toBe(true);
  });
});
