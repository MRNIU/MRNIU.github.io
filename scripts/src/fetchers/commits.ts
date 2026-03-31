import type { GraphQLClient } from "../graphql-client.js";
import type { RateLimitTracker } from "../rate-limit.js";
import type { CommitEvent, PageInfo } from "../types.js";
import { extractSemantic } from "../semantic.js";

const DISCOVER_REPOS_QUERY = `
query($login: String!, $first: Int!, $after: String) {
  user(login: $login) {
    repositoriesContributedTo(first: $first, after: $after, contributionTypes: COMMIT, includeUserRepositories: true) {
      nodes { nameWithOwner }
      pageInfo { hasNextPage endCursor }
    }
  }
}`;

const COMMITS_QUERY = `
query($owner: String!, $repo: String!, $authorId: ID!, $first: Int!, $after: String) {
  repository(owner: $owner, name: $repo) {
    defaultBranchRef {
      target {
        ... on Commit {
          history(first: $first, after: $after, author: { id: $authorId }) {
            nodes { oid abbreviatedOid message committedDate additions deletions }
            pageInfo { hasNextPage endCursor }
          }
        }
      }
    }
  }
}`;

export async function discoverRepos(
  client: GraphQLClient, tracker: RateLimitTracker, login: string
): Promise<string[]> {
  const repos: string[] = [];
  let cursor: string | null = null;
  while (tracker.canContinue()) {
    const data = await client.query<{
      user: { repositoriesContributedTo: { nodes: Array<{ nameWithOwner: string }>; pageInfo: PageInfo } };
    }>(DISCOVER_REPOS_QUERY, { login, first: 100, after: cursor });
    const conn = data.user.repositoriesContributedTo;
    for (const node of conn.nodes) repos.push(node.nameWithOwner);
    if (!conn.pageInfo.hasNextPage) break;
    cursor = conn.pageInfo.endCursor;
  }
  return repos;
}

interface FetchResult {
  events: CommitEvent[];
  endCursor: string | null;
  done: boolean;
}

export async function fetchCommitsForRepo(
  client: GraphQLClient, tracker: RateLimitTracker,
  repoFullName: string, authorId: string, cursor: string | null, cutoffDate: string | null
): Promise<FetchResult> {
  const [owner, repo] = repoFullName.split("/");
  const events: CommitEvent[] = [];
  let currentCursor = cursor;
  while (tracker.canContinue()) {
    const data = await client.query<{
      repository: { defaultBranchRef: { target: { history: {
        nodes: Array<{ oid: string; abbreviatedOid: string; message: string; committedDate: string; additions: number; deletions: number }>;
        pageInfo: PageInfo;
      }}} | null };
    }>(COMMITS_QUERY, { owner, repo, authorId, first: 100, after: currentCursor });
    const ref = data.repository.defaultBranchRef;
    if (!ref) return { events, endCursor: null, done: true };
    const { nodes, pageInfo } = ref.target.history;
    let hitCutoff = false;
    for (const commit of nodes) {
      if (cutoffDate && commit.committedDate <= cutoffDate) { hitCutoff = true; break; }
      events.push({
        id: `commit-${commit.oid}`, type: "commit", ts: commit.committedDate,
        repo: repoFullName, semantic: extractSemantic(commit.message),
        data: { sha: commit.oid, message: commit.message, additions: commit.additions, deletions: commit.deletions },
      });
    }
    if (hitCutoff || !pageInfo.hasNextPage) return { events, endCursor: pageInfo.endCursor, done: true };
    currentCursor = pageInfo.endCursor;
  }
  return { events, endCursor: currentCursor, done: false };
}
