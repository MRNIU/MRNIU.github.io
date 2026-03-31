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
              nodes { body path originalPosition }
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
  client: GraphQLClient, tracker: RateLimitTracker,
  login: string, year: number, cursor: string | null, cutoffDate: string | null
): Promise<FetchResult> {
  const events: ReviewEvent[] = [];
  let currentCursor = cursor;
  const from = `${year}-01-01T00:00:00Z`;
  const to = `${year}-12-31T23:59:59Z`;

  while (tracker.canContinue()) {
    const data = await client.query<{
      user: { contributionsCollection: { pullRequestReviewContributions: {
        nodes: Array<{
          occurredAt: string;
          pullRequest: { number: number; title: string; repository: { nameWithOwner: string } };
          pullRequestReview: { state: string; body: string; comments: { nodes: Array<{ body: string; path: string; originalPosition: number | null }> } };
        }>;
        pageInfo: PageInfo;
      }}};
    }>(QUERY, { login, from, to, first: 100, after: currentCursor });

    const contrib = data.user.contributionsCollection.pullRequestReviewContributions;
    let hitCutoff = false;
    for (const node of contrib.nodes) {
      if (cutoffDate && node.occurredAt <= cutoffDate) { hitCutoff = true; break; }
      const review = node.pullRequestReview;
      events.push({
        id: `review-${node.pullRequest.repository.nameWithOwner}-${node.pullRequest.number}-${node.occurredAt}`,
        type: "review", ts: node.occurredAt, repo: node.pullRequest.repository.nameWithOwner, semantic: null,
        data: {
          prNumber: node.pullRequest.number, prTitle: node.pullRequest.title,
          state: review.state, body: review.body || "",
          inlineComments: review.comments.nodes.map((c) => ({ path: c.path, line: c.originalPosition || 0, body: c.body })),
        },
      });
    }
    if (hitCutoff || !contrib.pageInfo.hasNextPage) return { events, endCursor: contrib.pageInfo.endCursor, done: true };
    currentCursor = contrib.pageInfo.endCursor;
  }
  return { events, endCursor: currentCursor, done: false };
}
