import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateAIRoasts } from "../src/ai-roast.js";
import type { GitPulseConfig } from "../src/config.js";
import type { GitPulseEvent } from "../src/types.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

const baseConfig: GitPulseConfig = {
  username: "MRNIU",
  locale: "en",
  scope: "all",
  targetRepos: [],
  ignoredRepos: [],
  filters: { ignoreShortComments: false, minCommentLength: 0, ignoreKeywords: [] },
  aiRoast: { enabled: true, frequency: "weekly", promptMode: "toxic_senior_dev", customPrompt: "" },
  llm: { baseUrl: "https://api.openai.com/v1", model: "gpt-4o" },
  schedule: { fetchCron: "0 2 * * *" },
};

const sampleEvents: GitPulseEvent[] = [
  { id: "c1", type: "commit", ts: "2026-03-25T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "feat", data: { sha: "aaa", message: "feat: add parser", additions: 10, deletions: 0 } },
  { id: "c2", type: "commit", ts: "2026-03-26T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "fix", data: { sha: "bbb", message: "fix: bug", additions: 1, deletions: 1 } },
  { id: "c3", type: "commit", ts: "2026-03-27T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "fix", data: { sha: "ccc", message: "fix: another bug", additions: 2, deletions: 1 } },
  { id: "pr1", type: "pull_request", ts: "2026-03-26T12:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "feat", data: { number: 1, title: "Add feature", state: "merged", body: "..." } },
];

describe("generateAIRoasts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("LLM_API_KEY", "test-key");
  });

  it("generates roast events from weekly summaries", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Nice work this week!" } }],
      }),
    });

    const roasts = await generateAIRoasts(baseConfig, sampleEvents, new Set());

    expect(roasts).toHaveLength(1);
    expect(roasts[0].type).toBe("ai_roast");
    expect(roasts[0].data.content).toBe("Nice work this week!");
    expect(roasts[0].data.stats.totalCommits).toBe(3);
    expect(roasts[0].data.stats.topRepo).toBe("MRNIU/SimpleKernel");

    // Verify API was called correctly
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(opts.headers.Authorization).toBe("Bearer test-key");
  });

  it("returns empty array when AI is disabled", async () => {
    const config = { ...baseConfig, aiRoast: { ...baseConfig.aiRoast, enabled: false } };
    const roasts = await generateAIRoasts(config, sampleEvents, new Set());
    expect(roasts).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty array when LLM_API_KEY is not set", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const roasts = await generateAIRoasts(baseConfig, sampleEvents, new Set());
    expect(roasts).toHaveLength(0);
  });

  it("skips weeks that already have roasts", async () => {
    const existingWeeks = new Set(["2026-03-23 ~ 2026-03-29"]);
    const roasts = await generateAIRoasts(baseConfig, sampleEvents, existingWeeks);
    expect(roasts).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("gracefully handles LLM API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const roasts = await generateAIRoasts(baseConfig, sampleEvents, new Set());
    expect(roasts).toHaveLength(0); // Failed but didn't throw
  });

  it("uses env vars to override config", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://custom.api/v1");
    vi.stubEnv("LLM_MODEL", "custom-model");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "roast" } }] }),
    });

    await generateAIRoasts(baseConfig, sampleEvents, new Set());

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://custom.api/v1/chat/completions");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("custom-model");
  });
});
