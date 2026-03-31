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
  client: GraphQLClient, tracker: RateLimitTracker,
  login: string, cursor: string | null, cutoffDate: string | null
): Promise<FetchResult> {
  const events: IssueEvent[] = [];
  let currentCursor = cursor;
  while (tracker.canContinue()) {
    const data = await client.query<{
      user: { issues: { nodes: Array<{ number: number; title: string; state: string; createdAt: string; body: string; repository: { nameWithOwner: string } }>; pageInfo: PageInfo } };
    }>(QUERY, { login, first: 100, after: currentCursor });
    const { nodes, pageInfo } = data.user.issues;
    let hitCutoff = false;
    for (const issue of nodes) {
      if (cutoffDate && issue.createdAt <= cutoffDate) { hitCutoff = true; break; }
      events.push({
        id: `issue-${issue.number}-${issue.repository.nameWithOwner}`,
        type: "issue", ts: issue.createdAt, repo: issue.repository.nameWithOwner,
        semantic: extractSemantic(issue.title),
        data: { number: issue.number, title: issue.title, state: issue.state.toLowerCase() as "open" | "closed", body: issue.body || "" },
      });
    }
    if (hitCutoff || !pageInfo.hasNextPage) return { events, endCursor: pageInfo.endCursor, done: true };
    currentCursor = pageInfo.endCursor;
  }
  return { events, endCursor: currentCursor, done: false };
}
