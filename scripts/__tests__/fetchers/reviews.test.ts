import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchReviews } from "../../src/fetchers/reviews.js";
import type { GraphQLClient } from "../../src/graphql-client.js";
import { RateLimitTracker } from "../../src/rate-limit.js";

describe("fetchReviews", () => {
  let tracker: RateLimitTracker;
  beforeEach(() => {
    tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 4000, cost: 1, resetAt: "" });
  });

  it("fetches reviews from contributionsCollection", async () => {
    const client = {
      query: vi.fn(async () => ({
        user: { contributionsCollection: { pullRequestReviewContributions: {
          nodes: [{
            occurredAt: "2026-03-27T16:45:00Z",
            pullRequest: { number: 128, title: "Fix page table walk for Sv48", repository: { nameWithOwner: "rcore-os/rCore" } },
            pullRequestReview: { state: "APPROVED", body: "Looks correct.",
              comments: { nodes: [{ body: "Use sfence.vma", path: "kernel/src/mm.rs", originalPosition: 87 }] } },
          }],
          pageInfo: { hasNextPage: false, endCursor: null },
        }}},
      })),
    } as unknown as GraphQLClient;
    const { events, done } = await fetchReviews(client, tracker, "MRNIU", 2026, null, null);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("review");
    expect(events[0].data.state).toBe("APPROVED");
    expect(events[0].data.inlineComments).toHaveLength(1);
    expect(events[0].data.inlineComments[0].path).toBe("kernel/src/mm.rs");
    expect(done).toBe(true);
  });
});
