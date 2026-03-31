import type { GitPulseConfig } from "./config.js";
import type { GitPulseEvent } from "./types.js";

export function createEventFilter(
  config: Pick<GitPulseConfig, "ignoredRepos" | "filters">
): (event: GitPulseEvent) => boolean {
  const ignoredRepoSet = new Set(
    config.ignoredRepos.map((r) => r.toLowerCase())
  );
  const keywords = config.filters.ignoreKeywords.map((k) => k.toLowerCase());

  return (event: GitPulseEvent): boolean => {
    if (event.type === "ai_roast") return true;
    if (event.repo && ignoredRepoSet.has(event.repo.toLowerCase())) return false;
    if (event.type === "commit") {
      const msg = event.data.message.toLowerCase();
      if (keywords.some((kw) => msg.includes(kw))) return false;
    }
    if (
      config.filters.ignoreShortComments &&
      (event.type === "issue_comment" || event.type === "review")
    ) {
      const body = event.data.body;
      if (body.length < config.filters.minCommentLength) return false;
    }
    return true;
  };
}
