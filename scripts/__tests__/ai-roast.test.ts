import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateAIRoasts, generateAISummaries } from "../src/ai-roast.js";
import type { GitPulseConfig } from "../src/config.js";
import type { AIRoastEvent, GitPulseEvent } from "../src/types.js";

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
    vi.unstubAllEnvs();
    vi.stubEnv("LLM_API_KEY", "test-key");
  });

  it("generates roast events from weekly summaries", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Nice work this week!" } }],
      }),
    });

    const roasts = await generateAIRoasts(baseConfig, sampleEvents, new Map());

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
    const body = JSON.parse(opts.body);
    expect(body.max_tokens).toBe(384000);
    expect(body.messages[0].content).toContain("insert spaces between Chinese characters and Latin letters");
    expect(body.messages[0].content).toContain("Chinese full-width punctuation");
    expect(body.messages[0].content).toContain("English half-width punctuation");
    expect(body.messages[0].content).toContain("Use Arabic numerals");
  });

  it("returns empty array when AI is disabled", async () => {
    const config = { ...baseConfig, aiRoast: { ...baseConfig.aiRoast, enabled: false } };
    const roasts = await generateAIRoasts(config, sampleEvents, new Map());
    expect(roasts).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns empty array when LLM_API_KEY is not set", async () => {
    vi.stubEnv("LLM_API_KEY", "");
    const roasts = await generateAIRoasts(baseConfig, sampleEvents, new Map());
    expect(roasts).toHaveLength(0);
  });

  it("skips weeks that already have roasts", async () => {
    const existingRoasts = new Map<string, AIRoastEvent>([
      ["2026-03-23 ~ 2026-03-29", {
        id: "ai-roast-2026-03-23",
        type: "ai_roast" as const,
        ts: "2026-03-29T00:00:00Z",
        repo: null,
        semantic: null,
        data: {
          weekRange: "2026-03-23 ~ 2026-03-29",
          content: "already final",
          status: "final" as const,
          stats: { totalCommits: 3, topRepo: "MRNIU/SimpleKernel" },
        },
      }],
    ]);
    const roasts = await generateAIRoasts(baseConfig, sampleEvents, existingRoasts);
    expect(roasts).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("generates a draft for unfinished weeks and a final version after week end", async () => {
    const currentWeekEvents: GitPulseEvent[] = [
      { id: "cw1", type: "commit", ts: "2026-06-01T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "feat", data: { sha: "cw1", message: "feat: monday work", additions: 10, deletions: 0 } },
      { id: "cw2", type: "commit", ts: "2026-06-01T11:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "fix", data: { sha: "cw2", message: "fix: monday bug", additions: 2, deletions: 1 } },
      { id: "cw3", type: "pull_request", ts: "2026-06-01T12:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "feat", data: { number: 2, title: "Monday feature", state: "open", body: "..." } },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "The week is still in progress." } }] }),
    });

    const draftRoasts = await generateAIRoasts(
      baseConfig,
      currentWeekEvents,
      new Map(),
      new Date("2026-06-02T00:00:00Z")
    );

    expect(draftRoasts).toHaveLength(1);
    expect(draftRoasts[0].id).toBe("ai-roast-2026-06-01");
    expect(draftRoasts[0].data.weekRange).toBe("2026-06-01 ~ 2026-06-07");
    expect(draftRoasts[0].data.status).toBe("draft");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "The week is now complete." } }] }),
    });

    const finalRoasts = await generateAIRoasts(
      baseConfig,
      currentWeekEvents,
      new Map([[draftRoasts[0].data.weekRange, draftRoasts[0]]]),
      new Date("2026-06-08T00:00:00Z")
    );

    expect(finalRoasts).toHaveLength(1);
    expect(finalRoasts[0].id).toBe("ai-roast-2026-06-01");
    expect(finalRoasts[0].data.weekRange).toBe("2026-06-01 ~ 2026-06-07");
    expect(finalRoasts[0].data.status).toBe("final");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("adds recent week context to new weekly roasts", async () => {
    const previousWeekEvents: GitPulseEvent[] = [
      { id: "p1", type: "commit", ts: "2026-03-18T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "fix", data: { sha: "p1", message: "fix: stabilize parser", additions: 2, deletions: 1 } },
      { id: "p2", type: "commit", ts: "2026-03-19T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "fix", data: { sha: "p2", message: "fix: parser edge case", additions: 3, deletions: 1 } },
      { id: "p3", type: "commit", ts: "2026-03-20T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "test", data: { sha: "p3", message: "test: parser regression", additions: 8, deletions: 0 } },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "This week continues the parser stabilization run." } }],
      }),
    });

    const roasts = await generateAIRoasts(
      baseConfig,
      [...sampleEvents, ...previousWeekEvents],
      new Map<string, AIRoastEvent>([
        ["2026-03-16 ~ 2026-03-22", {
          id: "ai-roast-2026-03-16",
          type: "ai_roast",
          ts: "2026-03-22T00:00:00Z",
          repo: null,
          semantic: null,
          data: {
            weekRange: "2026-03-16 ~ 2026-03-22",
            content: "already final",
            status: "final",
            stats: { totalCommits: 3, topRepo: "MRNIU/SimpleKernel" },
          },
        }],
      ])
    );

    expect(roasts).toHaveLength(1);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[1].content).toContain("Recent continuity context");
    expect(body.messages[1].content).toContain("2026-03-16 ~ 2026-03-22");
    expect(body.messages[1].content).toContain("fix: stabilize parser");
  });

  it("gracefully handles LLM API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    });

    const roasts = await generateAIRoasts(baseConfig, sampleEvents, new Map());
    expect(roasts).toHaveLength(0); // Failed but didn't throw
  });

  it("treats empty LLM content as a failed generation", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{
          finish_reason: "length",
          message: { content: "", reasoning_content: "thinking only" },
        }],
      }),
    });

    const roasts = await generateAIRoasts(baseConfig, sampleEvents, new Map());
    expect(roasts).toHaveLength(0);
  });

  it("uses env vars to override config", async () => {
    vi.stubEnv("LLM_BASE_URL", "https://custom.api/v1");
    vi.stubEnv("LLM_MODEL", "custom-model");

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "roast" } }] }),
    });

    await generateAIRoasts(baseConfig, sampleEvents, new Map());

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("https://custom.api/v1/chat/completions");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("custom-model");
  });

  it("applies output style rules to custom prompts", async () => {
    const config: GitPulseConfig = {
      ...baseConfig,
      aiRoast: {
        ...baseConfig.aiRoast,
        promptMode: "custom",
        customPrompt: "Use a dry engineering tone.",
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "roast" } }] }),
    });

    await generateAIRoasts(config, sampleEvents, new Map());

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("Use a dry engineering tone.");
    expect(body.messages[0].content).toContain("Output style rules:");
  });
});

describe("generateAISummaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    vi.stubEnv("LLM_API_KEY", "test-key");
  });

  it("generates completed monthly summary events", async () => {
    const config: GitPulseConfig = {
      ...baseConfig,
      aiRoast: {
        ...baseConfig.aiRoast,
        summaries: { enabled: true, periods: ["month"] },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "March centered on parser work with a clear fix loop." } }],
      }),
    });

    const summaries = await generateAISummaries(
      config,
      sampleEvents,
      new Set(),
      new Date("2026-04-02T00:00:00Z")
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0].id).toBe("ai-summary-month-2026-03");
    expect(summaries[0].type).toBe("ai_summary");
    expect(summaries[0].data.period).toBe("month");
    expect(summaries[0].data.range.label).toBe("2026-03");
    expect(summaries[0].data.stats.totalCommits).toBe(3);
    expect(summaries[0].data.stats.totalPRs).toBe(1);
    expect(summaries[0].data.stats.topRepo).toBe("MRNIU/SimpleKernel");

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("monthly engineering activity retrospective");
    expect(body.messages[1].content).toContain("Sub-period breakdown");
  });

  it("skips current unfinished periods", async () => {
    const config: GitPulseConfig = {
      ...baseConfig,
      aiRoast: {
        ...baseConfig.aiRoast,
        summaries: { enabled: true, periods: ["month"] },
      },
    };

    const summaries = await generateAISummaries(
      config,
      sampleEvents,
      new Set(),
      new Date("2026-03-29T00:00:00Z")
    );

    expect(summaries).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips summary events that already exist", async () => {
    const config: GitPulseConfig = {
      ...baseConfig,
      aiRoast: {
        ...baseConfig.aiRoast,
        summaries: { enabled: true, periods: ["month"] },
      },
    };

    const summaries = await generateAISummaries(
      config,
      sampleEvents,
      new Set(["ai-summary-month-2026-03"]),
      new Date("2026-04-02T00:00:00Z")
    );

    expect(summaries).toHaveLength(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("limits summary backfills per run across period levels", async () => {
    const config: GitPulseConfig = {
      ...baseConfig,
      aiRoast: {
        ...baseConfig.aiRoast,
        summaries: { enabled: true, periods: ["month", "quarter", "year"], maxPerRun: 1 },
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "The year stayed focused on kernel parser work." } }],
      }),
    });

    const summaries = await generateAISummaries(
      config,
      sampleEvents,
      new Set(),
      new Date("2027-01-02T00:00:00Z")
    );

    expect(summaries).toHaveLength(1);
    expect(summaries[0].id).toBe("ai-summary-year-2026");
    expect(summaries[0].data.period).toBe("year");
    expect(mockFetch).toHaveBeenCalledOnce();

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain("yearly engineering activity retrospective");
  });
});
