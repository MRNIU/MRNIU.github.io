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
  return { events, endCursor: currentCursor, done: false };
}
