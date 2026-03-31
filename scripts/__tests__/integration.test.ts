import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { writeEvents } from "../src/data-writer.js";
import { readCheckpoint, writeCheckpoint, createEmptyCheckpoint } from "../src/checkpoint.js";
import { createEventFilter } from "../src/filters.js";
import type { GitPulseEvent, IndexData, MonthlyData } from "../src/types.js";

const TEST_DIR = path.resolve(process.cwd(), "data/__test_integration");
const CHECKPOINT_PATH = path.join(TEST_DIR, "checkpoint.json");

function readJson<T>(name: string): T {
  return JSON.parse(fs.readFileSync(path.join(TEST_DIR, name), "utf-8"));
}

describe("integration: full write cycle", () => {
  beforeEach(() => { fs.mkdirSync(TEST_DIR, { recursive: true }); });
  afterEach(() => { fs.rmSync(TEST_DIR, { recursive: true, force: true }); });

  it("simulates two fetch cycles: initial backfill then incremental", () => {
    const filter = createEventFilter({
      ignoredRepos: ["MRNIU/test-repo"],
      filters: { ignoreShortComments: true, minCommentLength: 10, ignoreKeywords: ["typo"] },
    });

    // Cycle 1: Backfill batch
    const batch1: GitPulseEvent[] = [
      { id: "commit-aaa", type: "commit", ts: "2026-03-10T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "feat", data: { sha: "aaa", message: "feat: parser", additions: 50, deletions: 0 } },
      { id: "commit-filtered", type: "commit", ts: "2026-03-09T10:00:00Z", repo: "MRNIU/test-repo", semantic: null, data: { sha: "filtered", message: "test", additions: 1, deletions: 0 } },
      { id: "pr-1", type: "pull_request", ts: "2026-02-15T10:00:00Z", repo: "other/repo", semantic: "feat", data: { number: 1, title: "Add thing", state: "merged", body: "..." } },
    ];

    const filtered1 = batch1.filter(filter);
    expect(filtered1).toHaveLength(2);
    writeEvents(TEST_DIR, "MRNIU", filtered1);

    const cp = createEmptyCheckpoint();
    cp.lastFetchedAt = "2026-03-10T12:00:00Z";
    writeCheckpoint(CHECKPOINT_PATH, cp);

    const index1 = readJson<IndexData>("index.json");
    expect(index1.stats.totalCommits).toBe(1);
    expect(index1.stats.totalPRs).toBe(1);
    expect(index1.months).toHaveLength(2);

    const march1 = readJson<MonthlyData>("2026-03.json");
    expect(march1.events).toHaveLength(1);

    // Cycle 2: Incremental with new events
    const batch2: GitPulseEvent[] = [
      { id: "commit-bbb", type: "commit", ts: "2026-03-11T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "fix", data: { sha: "bbb", message: "fix: bug", additions: 3, deletions: 1 } },
      { id: "commit-aaa", type: "commit", ts: "2026-03-10T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "feat", data: { sha: "aaa", message: "feat: parser", additions: 50, deletions: 0 } },
    ];

    const filtered2 = batch2.filter(filter);
    writeEvents(TEST_DIR, "MRNIU", filtered2);

    const march2 = readJson<MonthlyData>("2026-03.json");
    expect(march2.events).toHaveLength(2);

    const index2 = readJson<IndexData>("index.json");
    expect(index2.stats.totalCommits).toBe(2);
    expect(index2.stats.totalPRs).toBe(1);

    const loadedCp = readCheckpoint(CHECKPOINT_PATH);
    expect(loadedCp.lastFetchedAt).toBe("2026-03-10T12:00:00Z");
  });
});
