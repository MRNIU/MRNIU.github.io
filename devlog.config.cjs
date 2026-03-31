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
  },
  llm: {
    baseUrl: "https://models.inference.ai.azure.com/v1",
    model: "gpt-4o-mini",
  },
  schedule: {
    fetchCron: "0 2 * * *",
  },
};
