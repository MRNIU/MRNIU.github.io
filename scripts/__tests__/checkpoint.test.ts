import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { readCheckpoint, writeCheckpoint, createEmptyCheckpoint } from "../src/checkpoint.js";

const TEST_DIR = path.resolve(process.cwd(), "data/__test_checkpoint");
const TEST_PATH = path.join(TEST_DIR, "checkpoint.json");

describe("checkpoint", () => {
  beforeEach(() => { fs.mkdirSync(TEST_DIR, { recursive: true }); });
  afterEach(() => { fs.rmSync(TEST_DIR, { recursive: true, force: true }); });

  it("createEmptyCheckpoint returns valid initial state", () => {
    const cp = createEmptyCheckpoint();
    expect(cp.lastFetchedAt).toBeNull();
    expect(cp.backfill.completed).toBe(false);
    expect(cp.backfill.pullRequests.done).toBe(false);
    expect(cp.backfill.commits.repoList).toEqual([]);
    expect(cp.backfill.commits.repoIndex).toBe(0);
  });

  it("returns empty checkpoint when file does not exist", () => {
    const cp = readCheckpoint(TEST_PATH);
    expect(cp.lastFetchedAt).toBeNull();
    expect(cp.backfill.completed).toBe(false);
  });

  it("round-trips write then read", () => {
    const cp = createEmptyCheckpoint();
    cp.lastFetchedAt = "2026-03-30T02:00:00Z";
    cp.backfill.pullRequests.cursor = "abc123";
    writeCheckpoint(TEST_PATH, cp);
    const loaded = readCheckpoint(TEST_PATH);
    expect(loaded.lastFetchedAt).toBe("2026-03-30T02:00:00Z");
    expect(loaded.backfill.pullRequests.cursor).toBe("abc123");
  });
});
