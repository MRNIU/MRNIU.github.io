import fs from "node:fs";
import path from "node:path";
import type { GitPulseEvent, MonthlyData, IndexData, MonthSummary, EventType } from "./types.js";

function getMonthKey(ts: string): string {
  return ts.slice(0, 7);
}

function groupByMonth(events: GitPulseEvent[]): Map<string, GitPulseEvent[]> {
  const groups = new Map<string, GitPulseEvent[]>();
  for (const event of events) {
    const key = getMonthKey(event.ts);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(event);
  }
  return groups;
}

function readMonthlyFile(filePath: string): MonthlyData | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as MonthlyData;
}

function buildMonthSummary(month: string, events: GitPulseEvent[]): MonthSummary {
  const repos = new Set<string>();
  const breakdown: Record<string, number> = {};
  const repoBreakdown: Record<string, number> = {};
  for (const e of events) {
    if (e.repo) {
      repos.add(e.repo);
      repoBreakdown[e.repo] = (repoBreakdown[e.repo] || 0) + 1;
    }
    breakdown[e.type] = (breakdown[e.type] || 0) + 1;
  }
  return {
    key: month,
    file: `${month}.json`,
    eventCount: events.length,
    repos: [...repos].sort(),
    breakdown: breakdown as Record<EventType, number>,
    repoBreakdown,
  };
}

function buildIndex(dataDir: string, user: string, updatedMonths: Map<string, GitPulseEvent[]>): IndexData {
  let totalCommits = 0, totalPRs = 0, totalReviews = 0, totalIssues = 0, totalComments = 0;
  const allRepos = new Set<string>();
  let earliest: string | null = null;
  let latest: string | null = null;
  const months: MonthSummary[] = [];

  const files = fs.readdirSync(dataDir).filter((f) => /^\d{4}-\d{2}\.json$/.test(f));
  for (const file of files) {
    const monthKey = file.replace(".json", "");
    const data = readMonthlyFile(path.join(dataDir, file))!;
    const finalEvents = updatedMonths.get(monthKey) || data.events;
    months.push(buildMonthSummary(monthKey, finalEvents));
    for (const e of finalEvents) {
      if (e.repo) allRepos.add(e.repo);
      if (!earliest || e.ts < earliest) earliest = e.ts;
      if (!latest || e.ts > latest) latest = e.ts;
      switch (e.type) {
        case "commit": totalCommits++; break;
        case "pull_request": totalPRs++; break;
        case "review": totalReviews++; break;
        case "issue": totalIssues++; break;
        case "issue_comment": totalComments++; break;
      }
    }
  }
  months.sort((a, b) => b.key.localeCompare(a.key));
  return {
    user, generatedAt: new Date().toISOString(),
    stats: { totalCommits, totalPRs, totalReviews, totalIssues, totalComments, activeRepos: allRepos.size, earliestEvent: earliest, latestEvent: latest },
    months,
  };
}

export function writeEvents(dataDir: string, user: string, newEvents: GitPulseEvent[]): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const grouped = groupByMonth(newEvents);
  const updatedMonths = new Map<string, GitPulseEvent[]>();

  for (const [month, events] of grouped) {
    const filePath = path.join(dataDir, `${month}.json`);
    const existing = readMonthlyFile(filePath);
    const existingEvents = existing?.events || [];
    const existingIds = new Set(existingEvents.map((e) => e.id));
    const merged = [...existingEvents, ...events.filter((e) => !existingIds.has(e.id))];
    merged.sort((a, b) => b.ts.localeCompare(a.ts));
    const monthData: MonthlyData = { month, events: merged };
    fs.writeFileSync(filePath, JSON.stringify(monthData, null, 2) + "\n");
    updatedMonths.set(month, merged);
  }

  const index = buildIndex(dataDir, user, updatedMonths);
  fs.writeFileSync(path.join(dataDir, "index.json"), JSON.stringify(index, null, 2) + "\n");
}
