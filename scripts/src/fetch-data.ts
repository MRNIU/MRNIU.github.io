import path from "node:path";
import { loadConfig } from "./config.js";
import { GraphQLClient } from "./graphql-client.js";
import { RateLimitTracker } from "./rate-limit.js";
import { readCheckpoint, writeCheckpoint } from "./checkpoint.js";
import { createEventFilter } from "./filters.js";
import { writeEvents } from "./data-writer.js";
import { generateAIRoasts } from "./ai-roast.js";
import { fetchPullRequests } from "./fetchers/pull-requests.js";
import { fetchIssues } from "./fetchers/issues.js";
import { fetchComments } from "./fetchers/comments.js";
import { fetchReviews } from "./fetchers/reviews.js";
import { discoverRepos, fetchCommitsForRepo } from "./fetchers/commits.js";
import type { GitPulseEvent, Checkpoint } from "./types.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const CHECKPOINT_PATH = path.join(DATA_DIR, "checkpoint.json");

async function getUserId(client: GraphQLClient, login: string): Promise<string> {
  const data = await client.query<{ user: { id: string } }>(
    `query($login: String!) { user(login: $login) { id } }`,
    { login }
  );
  return data.user.id;
}

async function runIncremental(
  client: GraphQLClient, tracker: RateLimitTracker,
  login: string, userId: string, checkpoint: Checkpoint
): Promise<GitPulseEvent[]> {
  const cutoff = checkpoint.lastFetchedAt;
  if (!cutoff) return [];

  console.log(`[incremental] Fetching events since ${cutoff}`);
  const allEvents: GitPulseEvent[] = [];

  if (tracker.canContinue()) {
    const { events } = await fetchPullRequests(client, tracker, login, null, cutoff);
    allEvents.push(...events);
    console.log(`  PRs: ${events.length}`);
  }
  if (tracker.canContinue()) {
    const { events } = await fetchIssues(client, tracker, login, null, cutoff);
    allEvents.push(...events);
    console.log(`  Issues: ${events.length}`);
  }
  if (tracker.canContinue()) {
    const { events } = await fetchComments(client, tracker, login, null, cutoff);
    allEvents.push(...events);
    console.log(`  Comments: ${events.length}`);
  }
  if (tracker.canContinue()) {
    const currentYear = new Date().getFullYear();
    const { events } = await fetchReviews(client, tracker, login, currentYear, null, cutoff);
    allEvents.push(...events);
    console.log(`  Reviews: ${events.length}`);
  }
  if (tracker.canContinue()) {
    const repos = await discoverRepos(client, tracker, login);
    let commitCount = 0;
    for (const repo of repos) {
      if (!tracker.canContinue()) break;
      const { events } = await fetchCommitsForRepo(client, tracker, repo, userId, null, cutoff);
      allEvents.push(...events);
      commitCount += events.length;
    }
    console.log(`  Commits: ${commitCount} (across ${repos.length} repos)`);
  }

  return allEvents;
}

async function runBackfill(
  client: GraphQLClient, tracker: RateLimitTracker,
  login: string, userId: string, checkpoint: Checkpoint
): Promise<GitPulseEvent[]> {
  if (checkpoint.backfill.completed) return [];
  console.log("[backfill] Continuing historical data fetch...");

  const allEvents: GitPulseEvent[] = [];
  const bf = checkpoint.backfill;

  if (!bf.pullRequests.done && tracker.canContinue()) {
    const { events, endCursor, done } = await fetchPullRequests(client, tracker, login, bf.pullRequests.cursor, null);
    allEvents.push(...events);
    bf.pullRequests.cursor = endCursor;
    bf.pullRequests.done = done;
    console.log(`  PRs backfill: ${events.length} (done: ${done})`);
  }
  if (!bf.issues.done && tracker.canContinue()) {
    const { events, endCursor, done } = await fetchIssues(client, tracker, login, bf.issues.cursor, null);
    allEvents.push(...events);
    bf.issues.cursor = endCursor;
    bf.issues.done = done;
    console.log(`  Issues backfill: ${events.length} (done: ${done})`);
  }
  if (!bf.issueComments.done && tracker.canContinue()) {
    const { events, endCursor, done } = await fetchComments(client, tracker, login, bf.issueComments.cursor, null);
    allEvents.push(...events);
    bf.issueComments.cursor = endCursor;
    bf.issueComments.done = done;
    console.log(`  Comments backfill: ${events.length} (done: ${done})`);
  }
  if (!bf.reviews.done && tracker.canContinue()) {
    const { events, endCursor, done } = await fetchReviews(client, tracker, login, bf.reviews.currentYear, bf.reviews.pageCursor, null);
    allEvents.push(...events);
    if (done) {
      const prevYear = bf.reviews.currentYear - 1;
      if (prevYear < 2008) {
        bf.reviews.done = true;
      } else {
        bf.reviews.currentYear = prevYear;
        bf.reviews.pageCursor = null;
      }
    } else {
      bf.reviews.pageCursor = endCursor;
    }
    console.log(`  Reviews backfill (${bf.reviews.currentYear}): ${events.length}`);
  }
  if (!bf.commits.done && tracker.canContinue()) {
    if (bf.commits.repoList.length === 0) {
      bf.commits.repoList = await discoverRepos(client, tracker, login);
      console.log(`  Discovered ${bf.commits.repoList.length} repos for commit backfill`);
    }
    while (bf.commits.repoIndex < bf.commits.repoList.length && tracker.canContinue()) {
      const repo = bf.commits.repoList[bf.commits.repoIndex];
      const { events, endCursor, done } = await fetchCommitsForRepo(client, tracker, repo, userId, bf.commits.pageCursor, null);
      allEvents.push(...events);
      if (done) {
        bf.commits.repoIndex++;
        bf.commits.pageCursor = null;
        console.log(`  Commits backfill [${repo}]: ${events.length} (complete)`);
      } else {
        bf.commits.pageCursor = endCursor;
        console.log(`  Commits backfill [${repo}]: ${events.length} (paused — rate limit)`);
        break;
      }
    }
    if (bf.commits.repoIndex >= bf.commits.repoList.length) {
      bf.commits.done = true;
    }
  }

  bf.completed = bf.pullRequests.done && bf.issues.done && bf.issueComments.done && bf.reviews.done && bf.commits.done;
  if (bf.completed) console.log("[backfill] All historical data fetched!");

  return allEvents;
}

async function main() {
  const config = loadConfig();
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN environment variable is required");
  }

  const tracker = new RateLimitTracker(500);
  const client = new GraphQLClient(token, tracker);
  const checkpoint = readCheckpoint(CHECKPOINT_PATH);
  const filter = createEventFilter(config);

  console.log(`[GitPulse] Fetching data for ${config.username}`);

  const userId = await getUserId(client, config.username);
  const incrementalEvents = await runIncremental(client, tracker, config.username, userId, checkpoint);
  const backfillEvents = await runBackfill(client, tracker, config.username, userId, checkpoint);

  const allEvents = [...incrementalEvents, ...backfillEvents];
  const filtered = allEvents.filter(filter);

  console.log(`[write] ${filtered.length} events after filtering (${allEvents.length - filtered.length} filtered out)`);

  if (filtered.length > 0) {
    writeEvents(DATA_DIR, config.username, filtered);
  }

  // AI Roast generation — covers both new events AND historical data missing roasts
  if (config.aiRoast.enabled) {
    const fs = await import("node:fs");
    const dataFiles = fs.readdirSync(DATA_DIR).filter(f => /^\d{4}-\d{2}\.json$/.test(f));

    // Collect all existing events + roast weeks from data files
    const existingRoastWeeks = new Set<string>();
    const allHistoricalEvents: GitPulseEvent[] = [];
    for (const file of dataFiles) {
      const content = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8"));
      for (const event of content.events) {
        if (event.type === "ai_roast") {
          existingRoastWeeks.add(event.data.weekRange);
        } else {
          allHistoricalEvents.push(event);
        }
      }
    }

    // Merge: historical events + newly fetched events (deduplicated by id)
    const seenIds = new Set(allHistoricalEvents.map(e => e.id));
    for (const e of filtered) {
      if (!seenIds.has(e.id)) {
        allHistoricalEvents.push(e);
      }
    }

    const roastEvents = await generateAIRoasts(config, allHistoricalEvents, existingRoastWeeks);
    if (roastEvents.length > 0) {
      writeEvents(DATA_DIR, config.username, roastEvents);
      console.log(`[ai-roast] Generated ${roastEvents.length} AI roast(s)`);
    } else {
      console.log("[ai-roast] All weeks already have roasts, nothing to generate");
    }
  }

  checkpoint.lastFetchedAt = new Date().toISOString();
  writeCheckpoint(CHECKPOINT_PATH, checkpoint);

  console.log(`[done] Rate limit remaining: ${tracker.remaining}`);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
