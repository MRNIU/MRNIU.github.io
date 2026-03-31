import { describe, it, expect, vi, beforeEach } from "vitest";
import { GraphQLClient } from "../src/graphql-client.js";
import { RateLimitTracker } from "../src/rate-limit.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("GraphQLClient", () => {
  let client: GraphQLClient;
  let tracker: RateLimitTracker;

  beforeEach(() => {
    vi.clearAllMocks();
    tracker = new RateLimitTracker(500);
    client = new GraphQLClient("fake-token", tracker);
  });

  it("sends a POST request to GitHub GraphQL endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          rateLimit: { limit: 5000, remaining: 4990, cost: 1, resetAt: "2026-04-01T00:00:00Z" },
          user: { login: "MRNIU" },
        },
      }),
    });

    const result = await client.query<{ user: { login: string } }>(
      "query { user(login: \"MRNIU\") { login } }"
    );

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.github.com/graphql");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Authorization"]).toBe("bearer fake-token");
    expect(result.user.login).toBe("MRNIU");
  });

  it("updates rate limit tracker from response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          rateLimit: { limit: 5000, remaining: 3000, cost: 5, resetAt: "2026-04-01T00:00:00Z" },
          viewer: { login: "test" },
        },
      }),
    });

    await client.query("query { viewer { login } }");
    expect(tracker.remaining).toBe(3000);
  });

  it("throws on GraphQL errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: null,
        errors: [{ message: "Field 'foo' doesn't exist" }],
      }),
    });

    await expect(client.query("query { foo }")).rejects.toThrow(
      "GraphQL error: Field 'foo' doesn't exist"
    );
  });

  it("throws on HTTP errors", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    await expect(client.query("query { viewer { login } }")).rejects.toThrow("401");
  });
});
