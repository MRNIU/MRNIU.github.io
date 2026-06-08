module.exports = {
  username: "MRNIU",
  locale: "en",
  scope: "all",
  targetRepos: [],
  ignoredRepos: ["MRNIU/test-repo"],
  filters: {
    ignoreShortComments: true,
    minCommentLength: 10,
    ignoreKeywords: ["wip", "update readme", "typo", "merge branch"],
  },
  aiRoast: {
    enabled: true,
    frequency: "weekly",
    promptMode: "toxic_senior_dev",
    customPrompt: "",
    repositoryContext: {
      enabled: true,
      maxReposPerWeek: 6,
      readmeChars: 500,
    },
    summaries: {
      enabled: true,
      periods: ["month", "quarter", "year"],
      maxPerRun: 10,
    },
  },
  llm: {
    baseUrl: "https://models.github.ai/inference",
    model: "openai/gpt-4o-mini",
  },
  schedule: {
    fetchCron: "0 2 * * *",
  },
};
