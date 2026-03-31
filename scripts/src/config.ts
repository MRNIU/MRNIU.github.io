import { createRequire } from "node:module";
import path from "node:path";

export interface GitPulseConfig {
  username: string;
  locale: string;
  scope: "all" | "specific";
  targetRepos: string[];
  ignoredRepos: string[];
  filters: {
    ignoreShortComments: boolean;
    minCommentLength: number;
    ignoreKeywords: string[];
  };
  aiRoast: {
    enabled: boolean;
    frequency: string;
    promptMode: "toxic_senior_dev" | "encouraging_mentor" | "custom";
    customPrompt: string;
  };
  llm: {
    baseUrl: string;
    model: string;
  };
  schedule: {
    fetchCron: string;
  };
}

export function loadConfig(): GitPulseConfig {
  const require = createRequire(import.meta.url);
  const configPath = path.resolve(process.cwd(), "devlog.config.cjs");
  delete require.cache[configPath];
  return require(configPath) as GitPulseConfig;
}
