import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchIssues } from "../../src/fetchers/issues.js";
import type { GraphQLClient } from "../../src/graphql-client.js";
import { RateLimitTracker } from "../../src/rate-limit.js";

describe("fetchIssues", () => {
  let tracker: RateLimitTracker;
  beforeEach(() => {
    tracker = new RateLimitTracker(500);
    tracker.update({ limit: 5000, remaining: 4000, cost: 1, resetAt: "" });
  });

  it("fetches issues and converts to IssueEvent[]", async () => {
    const client = {
      query: vi.fn(async () => ({
        user: { issues: {
          nodes: [{ number: 99, title: "Boot fails on real hardware", state: "OPEN", createdAt: "2026-03-26T11:00:00Z", body: "When ACPI RSDT spans multiple pages...", repository: { nameWithOwner: "MRNIU/SimpleKernel" } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        }},
      })),
    } as unknown as GraphQLClient;
    const { events, done } = await fetchIssues(client, tracker, "MRNIU", null, null);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("issue");
    expect(events[0].id).toBe("issue-99-MRNIU/SimpleKernel");
    expect(events[0].data.state).toBe("open");
    expect(done).toBe(true);
  });
});
