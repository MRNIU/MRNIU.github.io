import type { GraphQLClient } from "../graphql-client.js";
import type { RateLimitTracker } from "../rate-limit.js";
import type { IssueCommentEvent, PageInfo } from "../types.js";

const QUERY = `
query($login: String!, $first: Int!, $after: String) {
  user(login: $login) {
    issueComments(first: $first, after: $after, orderBy: { direction: DESC }) {
      nodes {
        createdAt
        body
        issue {
          number
          title
          repository { nameWithOwner }
        }
      }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

interface FetchResult {
  events: IssueCommentEvent[];
  endCursor: string | null;
  done: boolean;
}

let commentCounter = 0;

export async function fetchComments(
  client: GraphQLClient, tracker: RateLimitTracker,
  login: string, cursor: string | null, cutoffDate: string | null
): Promise<FetchResult> {
  const events: IssueCommentEvent[] = [];
  let currentCursor = cursor;
  while (tracker.canContinue()) {
    const data = await client.query<{
      user: { issueComments: { nodes: Array<{ createdAt: string; body: string; issue: { number: number; title: string; repository: { nameWithOwner: string } } }>; pageInfo: PageInfo } };
    }>(QUERY, { login, first: 100, after: currentCursor });
    const { nodes, pageInfo } = data.user.issueComments;
    let hitCutoff = false;
    for (const comment of nodes) {
      if (cutoffDate && comment.createdAt <= cutoffDate) { hitCutoff = true; break; }
      events.push({
        id: `comment-${comment.issue.repository.nameWithOwner}-${comment.issue.number}-${commentCounter++}`,
        type: "issue_comment", ts: comment.createdAt, repo: comment.issue.repository.nameWithOwner, semantic: null,
        data: { issueNumber: comment.issue.number, issueTitle: comment.issue.title, body: comment.body || "" },
      });
    }
    if (hitCutoff || !pageInfo.hasNextPage) return { events, endCursor: pageInfo.endCursor, done: true };
    currentCursor = pageInfo.endCursor;
  }
  return { events, endCursor: currentCursor, done: false };
}
