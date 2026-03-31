import fs from "node:fs";
import type { Checkpoint } from "./types.js";

export function createEmptyCheckpoint(): Checkpoint {
  return {
    lastFetchedAt: null,
    backfill: {
      completed: false,
      pullRequests: { cursor: null, done: false },
      issues: { cursor: null, done: false },
      issueComments: { cursor: null, done: false },
      reviews: { currentYear: new Date().getFullYear(), pageCursor: null, done: false },
      commits: { repoList: [], repoIndex: 0, pageCursor: null, done: false },
    },
  };
}

export function readCheckpoint(filePath: string): Checkpoint {
  if (!fs.existsSync(filePath)) {
    return createEmptyCheckpoint();
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as Checkpoint;
}

export function writeCheckpoint(filePath: string, checkpoint: Checkpoint): void {
  fs.writeFileSync(filePath, JSON.stringify(checkpoint, null, 2) + "\n");
}
