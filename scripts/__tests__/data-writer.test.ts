import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { writeEvents } from "../src/data-writer.js";
import type { AIRoastEvent, GitPulseEvent, IndexData, MonthlyData } from "../src/types.js";

const TEST_DIR = path.resolve(process.cwd(), "data/__test_writer");

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(path.join(TEST_DIR, file), "utf-8"));
}

describe("writeEvents", () => {
  beforeEach(() => { fs.mkdirSync(TEST_DIR, { recursive: true }); });
  afterEach(() => { fs.rmSync(TEST_DIR, { recursive: true, force: true }); });

  it("creates monthly JSON files grouped by event timestamp", () => {
    const events: GitPulseEvent[] = [
      { id: "commit-aaa", type: "commit", ts: "2026-03-15T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "feat", data: { sha: "aaa", message: "feat: something", additions: 5, deletions: 0 } },
      { id: "commit-bbb", type: "commit", ts: "2026-02-10T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "fix", data: { sha: "bbb", message: "fix: bug", additions: 1, deletions: 1 } },
    ];
    writeEvents(TEST_DIR, "MRNIU", events);
    const march = readJson<MonthlyData>("2026-03.json");
    expect(march.month).toBe("2026-03");
    expect(march.events).toHaveLength(1);
    expect(march.events[0].id).toBe("commit-aaa");
    const feb = readJson<MonthlyData>("2026-02.json");
    expect(feb.month).toBe("2026-02");
    expect(feb.events).toHaveLength(1);
  });

  it("creates index.json with correct stats", () => {
    const events: GitPulseEvent[] = [
      { id: "commit-aaa", type: "commit", ts: "2026-03-15T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "feat", data: { sha: "aaa", message: "feat: something", additions: 5, deletions: 0 } },
      { id: "pr-1", type: "pull_request", ts: "2026-03-14T10:00:00Z", repo: "other/repo", semantic: "feat", data: { number: 1, title: "Add feature", state: "merged", body: "..." } },
    ];
    writeEvents(TEST_DIR, "MRNIU", events);
    const index = readJson<IndexData>("index.json");
    expect(index.user).toBe("MRNIU");
    expect(index.stats.totalCommits).toBe(1);
    expect(index.stats.totalPRs).toBe(1);
    expect(index.stats.activeRepos).toBe(2);
    expect(index.months).toHaveLength(1);
    expect(index.months[0].key).toBe("2026-03");
    expect(index.months[0].eventCount).toBe(2);
  });

  it("merges new events into existing monthly files without duplicates", () => {
    const batch1: GitPulseEvent[] = [
      { id: "commit-aaa", type: "commit", ts: "2026-03-15T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "feat", data: { sha: "aaa", message: "feat: first", additions: 5, deletions: 0 } },
    ];
    writeEvents(TEST_DIR, "MRNIU", batch1);
    const batch2: GitPulseEvent[] = [
      { id: "commit-aaa", type: "commit", ts: "2026-03-15T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "feat", data: { sha: "aaa", message: "feat: first", additions: 5, deletions: 0 } },
      { id: "commit-ccc", type: "commit", ts: "2026-03-16T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: "fix", data: { sha: "ccc", message: "fix: second", additions: 1, deletions: 1 } },
    ];
    writeEvents(TEST_DIR, "MRNIU", batch2);
    const march = readJson<MonthlyData>("2026-03.json");
    expect(march.events).toHaveLength(2);
    const ids = march.events.map((e) => e.id);
    expect(ids).toContain("commit-aaa");
    expect(ids).toContain("commit-ccc");
  });

  it("replaces generated AI events with the same id", () => {
    const draft: AIRoastEvent = {
      id: "ai-roast-2026-06-01",
      type: "ai_roast",
      ts: "2026-06-07T00:00:00Z",
      repo: null,
      semantic: null,
      data: {
        weekRange: "2026-06-01 ~ 2026-06-07",
        content: "draft",
        status: "draft",
        stats: { totalCommits: 3, topRepo: "MRNIU/SimpleKernel" },
      },
    };
    const final: AIRoastEvent = {
      ...draft,
      data: {
        ...draft.data,
        content: "final",
        status: "final",
      },
    };

    writeEvents(TEST_DIR, "MRNIU", [draft]);
    writeEvents(TEST_DIR, "MRNIU", [final]);

    const june = readJson<MonthlyData>("2026-06.json");
    expect(june.events).toHaveLength(1);
    const event = june.events[0];
    expect(event.id).toBe("ai-roast-2026-06-01");
    expect(event.type).toBe("ai_roast");
    if (event.type !== "ai_roast") throw new Error("Expected ai_roast event");
    expect(event.data.content).toBe("final");
    expect(event.data.status).toBe("final");
  });

  it("sorts events by timestamp descending within each month", () => {
    const events: GitPulseEvent[] = [
      { id: "commit-early", type: "commit", ts: "2026-03-01T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: null, data: { sha: "e", message: "early", additions: 1, deletions: 0 } },
      { id: "commit-late", type: "commit", ts: "2026-03-20T10:00:00Z", repo: "MRNIU/SimpleKernel", semantic: null, data: { sha: "l", message: "late", additions: 1, deletions: 0 } },
    ];
    writeEvents(TEST_DIR, "MRNIU", events);
    const march = readJson<MonthlyData>("2026-03.json");
    expect(march.events[0].id).toBe("commit-late");
    expect(march.events[1].id).toBe("commit-early");
  });
});
