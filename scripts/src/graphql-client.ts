import type { RateLimitInfo } from "./types.js";
import { RateLimitTracker } from "./rate-limit.js";

const GITHUB_GRAPHQL_URL = "https://api.github.com/graphql";

function wrapWithRateLimit(query: string): string {
  const idx = query.indexOf("{", query.indexOf("{") + 1);
  if (idx === -1) return query;
  return query.slice(0, idx + 1) + "\n  rateLimit { limit remaining cost resetAt }\n" + query.slice(idx + 1);
}

export class GraphQLClient {
  private token: string;
  private tracker: RateLimitTracker;

  constructor(token: string, tracker: RateLimitTracker) {
    this.token = token;
    this.tracker = tracker;
  }

  async query<T>(
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const wrappedQuery = wrapWithRateLimit(query);

    const response = await fetch(GITHUB_GRAPHQL_URL, {
      method: "POST",
      headers: {
        Authorization: `bearer ${this.token}`,
        "Content-Type": "application/json",
        "User-Agent": "GitPulse/1.0",
      },
      body: JSON.stringify({ query: wrappedQuery, variables }),
    });

    if (!response.ok) {
      throw new Error(
        `GitHub API error: ${response.status} ${response.statusText}`
      );
    }

    const json = (await response.json()) as {
      data: T & { rateLimit?: RateLimitInfo };
      errors?: Array<{ message: string }>;
    };

    if (json.errors?.length) {
      throw new Error(`GraphQL error: ${json.errors[0].message}`);
    }

    if (json.data.rateLimit) {
      this.tracker.update(json.data.rateLimit);
      delete (json.data as Record<string, unknown>).rateLimit;
    }

    return json.data;
  }
}
