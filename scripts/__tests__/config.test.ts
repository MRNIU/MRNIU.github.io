import { describe, it, expect } from "vitest";
import { loadConfig, type GitPulseConfig } from "../src/config.js";

describe("loadConfig", () => {
  it("loads the default config file and returns typed config", () => {
    const config = loadConfig();
    expect(config.username).toBe("MRNIU");
    expect(config.scope).toBe("all");
    expect(config.filters.ignoreKeywords).toContain("typo");
    expect(config.aiRoast.enabled).toBe(true);
    expect(config.llm.baseUrl).toBe("https://models.inference.ai.azure.com");
  });

  it("has required fields", () => {
    const config = loadConfig();
    expect(config.username).toBeTruthy();
    expect(config.ignoredRepos).toBeInstanceOf(Array);
    expect(config.filters).toBeDefined();
    expect(config.schedule.fetchCron).toBeTruthy();
  });
});
