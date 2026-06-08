import { Buffer } from "node:buffer";
import type { GitPulseConfig } from "./config.js";
import type { AIRoastEvent, AISummaryEvent, AISummaryPeriod, AISummaryStats, GitPulseEvent } from "./types.js";

const SYSTEM_PROMPTS: Record<string, string> = {
  toxic_senior_dev: `You are a brutally honest senior developer reviewing a weekly GitHub activity log across multiple independent projects.
Your style: sarcastic, witty, technically sharp. Point out patterns like repetitive commit messages,
too many "fix" commits, suspiciously small PRs, overambitious refactors, or missing review loops.
Project boundary rules:
- Treat each repository as a separate project unless the input explicitly marks repos as the same project family.
- Do not blend unrelated repositories into one causal story, one metaphor, or one joke.
- If the week spans multiple domains, call out 2-3 separate work streams briefly instead of forcing a single theme.
- Use repository descriptions, languages, topics, and README excerpts only as context for that same repository.
- Only compare continuity within the same repository or explicit project family.
- Roast engineering patterns, commit hygiene, review habits, and scope control; avoid personal insults, vulgar metaphors, or unsupported claims.
Keep it under 3 sentences. Be funny, not mean. Write in the same language as the commit messages -
if they're in English, respond in English; if Chinese, respond in Chinese.`,

  encouraging_mentor: `You are a warm and encouraging senior mentor reviewing a developer's weekly activity across multiple independent projects.
Highlight what they did well, note impressive patterns (deep reviews, big features, cross-repo work).
Keep unrelated repositories separate unless the input explicitly marks them as the same project family.
Give one gentle suggestion for improvement. Keep it under 3 sentences.
Write in the same language as the commit messages.`,
};

const SUMMARY_PROMPTS: Record<AISummaryPeriod, string> = {
  month: `You are writing a concise monthly engineering activity retrospective.
Explain the main work streams, important repo focus, recurring habits, and how this month continued or changed from the previous period when context is available.
Keep it to 3-5 sentences. Write in the dominant language of the activity samples.`,

  quarter: `You are writing a quarterly engineering activity retrospective.
Explain the technical direction, major project themes, collaboration/review pattern, and clear changes from the previous period when context is available.
Keep it to 4-6 sentences. Write in the dominant language of the activity samples.`,

  year: `You are writing a yearly engineering activity retrospective for a developer portfolio timeline.
Summarize the major projects, technical trajectory, activity rhythm, collaboration pattern, and the strongest engineering habits visible across the year.
Keep it to 5-7 sentences. Write in the dominant language of the activity samples.`,
};

export const OUTPUT_STYLE_GUIDE = `Output style rules:
- For Chinese output, follow common Chinese technical writing style: insert spaces between Chinese characters and Latin letters, English words, Arabic numerals, and technical abbreviations. Example: "写了 3 个 PR", not "写了3个PR".
- Use Chinese full-width punctuation in Chinese sentences, such as ，。！？；：（）. Do not put spaces before Chinese punctuation, and only keep a space after Chinese punctuation when the next token is Latin text, an Arabic numeral, or a code-like identifier.
- Use English half-width punctuation in English sentences. Do not mix full-width Chinese punctuation into pure English output.
- Keep repository names, commit types, API names, model names, code identifiers, and URLs exactly as written, using ASCII punctuation when they are code-like tokens.
- Use Arabic numerals for counts, dates, versions, percentages, and measurements. Do not spell counts out as words unless the original technical term requires it.
- Normalize wording before returning: avoid "三个 commit", "six commits", "AI修 bug", and "3个 PR"; write "3 个 commit", "6 commits", "AI 修 bug", and "3 个 PR" instead.
- Before finalizing, silently review the answer against the spacing, punctuation, and numeral rules above, then return only the polished response.
- Avoid markdown lists, headings, code blocks, and emoji.`;

const COUNT_NOUNS = "(?:commits?|PRs?|reviews?|issues?|comments?|files?|weeks?|days?|months?|quarters?|years?|times?|fixes?|bugs?|features?|version bumps?)";
const COUNT_TARGETS = `(?:${COUNT_NOUNS}|saying|["“])`;
const DEFAULT_SUMMARY_PERIODS: AISummaryPeriod[] = ["month", "quarter", "year"];
const AI_REQUEST_DELAY_MS = 5000;
const MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_REPO_CONTEXT_MAX_REPOS_PER_WEEK = 6;
const DEFAULT_REPO_CONTEXT_README_CHARS = 500;
const SUMMARY_PERIOD_PRIORITY: Record<AISummaryPeriod, number> = {
  year: 0,
  quarter: 1,
  month: 2,
};

function withOutputStyleGuide(prompt: string): string {
  return `${prompt}\n\n${OUTPUT_STYLE_GUIDE}`;
}

function formatAIContent(content: string): string {
  return content
    .trim()
    .replace(new RegExp(`\\bzero(?=\\s+${COUNT_TARGETS})`, "gi"), "0")
    .replace(new RegExp(`\\bone(?=\\s+${COUNT_TARGETS})`, "gi"), "1")
    .replace(new RegExp(`\\btwo(?=\\s+${COUNT_TARGETS})`, "gi"), "2")
    .replace(new RegExp(`\\bthree(?=\\s+${COUNT_TARGETS})`, "gi"), "3")
    .replace(new RegExp(`\\bfour(?=\\s+${COUNT_TARGETS})`, "gi"), "4")
    .replace(new RegExp(`\\bfive(?=\\s+${COUNT_TARGETS})`, "gi"), "5")
    .replace(new RegExp(`\\bsix(?=\\s+${COUNT_TARGETS})`, "gi"), "6")
    .replace(new RegExp(`\\bseven(?=\\s+${COUNT_TARGETS})`, "gi"), "7")
    .replace(new RegExp(`\\beight(?=\\s+${COUNT_TARGETS})`, "gi"), "8")
    .replace(new RegExp(`\\bnine(?=\\s+${COUNT_TARGETS})`, "gi"), "9")
    .replace(new RegExp(`\\bten(?=\\s+${COUNT_TARGETS})`, "gi"), "10")
    .replace(new RegExp(`\\beleven(?=\\s+${COUNT_TARGETS})`, "gi"), "11")
    .replace(new RegExp(`\\btwelve(?=\\s+${COUNT_TARGETS})`, "gi"), "12")
    .replace(new RegExp(`\\bthirteen(?=\\s+${COUNT_TARGETS})`, "gi"), "13")
    .replace(new RegExp(`\\bfourteen(?=\\s+${COUNT_TARGETS})`, "gi"), "14")
    .replace(new RegExp(`\\bfifteen(?=\\s+${COUNT_TARGETS})`, "gi"), "15")
    .replace(new RegExp(`\\bsixteen(?=\\s+${COUNT_TARGETS})`, "gi"), "16")
    .replace(new RegExp(`\\bseventeen(?=\\s+${COUNT_TARGETS})`, "gi"), "17")
    .replace(new RegExp(`\\beighteen(?=\\s+${COUNT_TARGETS})`, "gi"), "18")
    .replace(new RegExp(`\\bnineteen(?=\\s+${COUNT_TARGETS})`, "gi"), "19")
    .replace(new RegExp(`\\btwenty(?=\\s+${COUNT_TARGETS})`, "gi"), "20")
    .replace(/([\p{Script=Han}])([A-Za-z0-9][A-Za-z0-9_.+#/-]*)/gu, "$1 $2")
    .replace(/([A-Za-z0-9][A-Za-z0-9_.+#/-]*)([\p{Script=Han}])/gu, "$1 $2")
    .replace(/([\p{Script=Han}])(["`])(?=[A-Za-z0-9])/gu, "$1 $2")
    .replace(/(["`])([\p{Script=Han}])/gu, "$1 $2")
    .replace(/([\p{Script=Han}]),/gu, "$1，")
    .replace(/,([\p{Script=Han}])/gu, "，$1")
    .replace(/([\p{Script=Han}]);/gu, "$1；")
    .replace(/;([\p{Script=Han}])/gu, "；$1")
    .replace(/(^|[.!?。！？]\s*)([\p{Script=Han}][^.!?\n。！？]{0,120})!/gu, "$1$2！")
    .replace(/(^|[.!?。！？]\s*)([\p{Script=Han}][^.!?\n。！？]{0,120})\?/gu, "$1$2？")
    .replace(/\s+([，。！？；：])/gu, "$1")
    .replace(/([，。！？；：])\s+/gu, "$1")
    .replace(/([，。！？；：])([A-Za-z0-9])/gu, "$1 $2")
    .replace(/[ \t]{2,}/g, " ");
}

interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  totalCommits: number;
  totalPRs: number;
  totalReviews: number;
  totalIssues: number;
  totalComments: number;
  topRepo: string;
  sampleMessages: string[];
  sampleReviews: string[];
  repoBreakdown: RepoActivitySummary[];
}

interface RepoActivitySummary {
  repo: string;
  totalEvents: number;
  totalCommits: number;
  totalPRs: number;
  totalReviews: number;
  totalIssues: number;
  totalComments: number;
  topSemantic: string | null;
  sampleMessages: string[];
  samplePRs: string[];
  sampleReviews: string[];
  sampleIssues: string[];
}

interface RepositoryContext {
  repo: string;
  description: string | null;
  primaryLanguage: string | null;
  topics: string[];
  readmeExcerpt: string | null;
}

interface RepositoryContextOptions {
  enabled: boolean;
  maxReposPerWeek: number;
  readmeChars: number;
}

interface PeriodSummary {
  id: string;
  period: AISummaryPeriod;
  label: string;
  start: string;
  end: string;
  ts: string;
  events: GitPulseEvent[];
  stats: AISummaryStats;
  topSemantic: string | null;
  sampleMessages: string[];
  sampleReviews: string[];
}

function isAIEvent(event: GitPulseEvent): boolean {
  return event.type === "ai_roast" || event.type === "ai_summary";
}

function firstLine(value: string): string {
  return value.split("\n")[0] || value;
}

function getDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function getStats(events: GitPulseEvent[]): AISummaryStats {
  let totalCommits = 0;
  let totalPRs = 0;
  let totalReviews = 0;
  let totalIssues = 0;
  let totalComments = 0;
  const repoCounts = new Map<string, number>();

  for (const event of events) {
    if (event.repo) repoCounts.set(event.repo, (repoCounts.get(event.repo) || 0) + 1);
    switch (event.type) {
      case "commit":
        totalCommits++;
        break;
      case "pull_request":
        totalPRs++;
        break;
      case "review":
        totalReviews++;
        break;
      case "issue":
        totalIssues++;
        break;
      case "issue_comment":
        totalComments++;
        break;
    }
  }

  const topRepo = [...repoCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
  return { totalCommits, totalPRs, totalReviews, totalIssues, totalComments, activeRepos: repoCounts.size, topRepo };
}

function getTopSemantic(events: GitPulseEvent[]): string | null {
  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.semantic) counts.set(event.semantic, (counts.get(event.semantic) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
}

function formatCountSummary(stats: {
  totalCommits: number;
  totalPRs: number;
  totalReviews: number;
  totalIssues: number;
  totalComments: number;
}): string {
  return `${stats.totalCommits} commits, ${stats.totalPRs} PRs, ${stats.totalReviews} reviews, ${stats.totalIssues} issues, ${stats.totalComments} comments`;
}

function buildRepoBreakdown(events: GitPulseEvent[]): RepoActivitySummary[] {
  const groups = new Map<string, GitPulseEvent[]>();
  for (const event of events) {
    const repo = event.repo || "unknown";
    if (!groups.has(repo)) groups.set(repo, []);
    groups.get(repo)!.push(event);
  }

  return [...groups.entries()]
    .map(([repo, repoEvents]) => {
      const stats = getStats(repoEvents);
      const sampleMessages = repoEvents
        .filter(e => e.type === "commit")
        .slice(0, 6)
        .map(e => e.type === "commit" ? e.data.message : "")
        .filter(Boolean);
      const samplePRs = repoEvents
        .filter(e => e.type === "pull_request")
        .slice(0, 4)
        .map(e => e.type === "pull_request" ? `${e.data.state}: ${e.data.title}` : "")
        .filter(Boolean);
      const sampleReviews = repoEvents
        .filter(e => e.type === "review")
        .slice(0, 3)
        .map(e => e.type === "review" ? `${e.data.state}: ${e.data.prTitle}` : "")
        .filter(Boolean);
      const sampleIssues = repoEvents
        .filter(e => e.type === "issue" || e.type === "issue_comment")
        .slice(0, 3)
        .map(e => {
          if (e.type === "issue") return `${e.data.state}: ${e.data.title}`;
          if (e.type === "issue_comment") return `comment: ${e.data.issueTitle}`;
          return "";
        })
        .filter(Boolean);

      return {
        repo,
        totalEvents: repoEvents.length,
        totalCommits: stats.totalCommits,
        totalPRs: stats.totalPRs,
        totalReviews: stats.totalReviews,
        totalIssues: stats.totalIssues,
        totalComments: stats.totalComments,
        topSemantic: getTopSemantic(repoEvents),
        sampleMessages,
        samplePRs,
        sampleReviews,
        sampleIssues,
      };
    })
    .sort((a, b) => b.totalEvents - a.totalEvents || a.repo.localeCompare(b.repo));
}

function totalActivity(stats: AISummaryStats): number {
  return stats.totalCommits + stats.totalPRs + stats.totalReviews + stats.totalIssues + stats.totalComments;
}

function groupEventsByWeek(events: GitPulseEvent[]): WeekSummary[] {
  const weeks = new Map<string, GitPulseEvent[]>();

  for (const event of events) {
    if (isAIEvent(event)) continue;
    const date = new Date(event.ts);
    const day = date.getUTCDay();
    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - (day === 0 ? 6 : day - 1));
    const weekKey = getDateOnly(monday);

    if (!weeks.has(weekKey)) weeks.set(weekKey, []);
    weeks.get(weekKey)!.push(event);
  }

  const summaries: WeekSummary[] = [];
  for (const [weekStart, weekEvents] of weeks) {
    const endDate = new Date(`${weekStart}T00:00:00Z`);
    endDate.setUTCDate(endDate.getUTCDate() + 6);
    const weekEnd = getDateOnly(endDate);
    const stats = getStats(weekEvents);

    const sampleMessages = weekEvents
      .filter(e => e.type === "commit")
      .slice(0, 30)
      .map(e => e.type === "commit" ? e.data.message : "")
      .filter(Boolean);

    const sampleReviews = weekEvents
      .filter(e => e.type === "review")
      .slice(0, 10)
      .map(e => e.type === "review" ? `${e.data.state}: ${e.data.body}`.slice(0, 100) : "")
      .filter(Boolean);

    summaries.push({
      weekStart,
      weekEnd,
      totalCommits: stats.totalCommits,
      totalPRs: stats.totalPRs,
      totalReviews: stats.totalReviews,
      totalIssues: stats.totalIssues,
      totalComments: stats.totalComments,
      topRepo: stats.topRepo,
      sampleMessages,
      sampleReviews,
      repoBreakdown: buildRepoBreakdown(weekEvents),
    });
  }

  return summaries.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

function formatWeekStats(summary: WeekSummary): string {
  return formatCountSummary(summary);
}

function getPreviousWeeks(summary: WeekSummary, chronologicalWeeks: WeekSummary[]): WeekSummary[] {
  return chronologicalWeeks
    .filter(week => week.weekStart < summary.weekStart)
    .slice(-3);
}

function formatRepositoryContext(context: RepositoryContext | undefined): string {
  if (!context) return "No repository metadata available.";

  const parts: string[] = [];
  if (context.description) parts.push(`description: ${context.description}`);
  if (context.primaryLanguage) parts.push(`language: ${context.primaryLanguage}`);
  if (context.topics.length > 0) parts.push(`topics: ${context.topics.join(", ")}`);
  if (context.readmeExcerpt) parts.push(`README excerpt: ${context.readmeExcerpt}`);

  return parts.length > 0 ? parts.join("; ") : "Repository metadata is empty.";
}

function formatRepoSamples(repo: RepoActivitySummary): string {
  const samples: string[] = [];
  samples.push(...repo.sampleMessages.map(message => `commit: ${firstLine(message)}`));
  samples.push(...repo.samplePRs.map(title => `PR: ${title}`));
  samples.push(...repo.sampleReviews.map(review => `review: ${review}`));
  samples.push(...repo.sampleIssues.map(issue => `issue/comment: ${issue}`));
  return samples.slice(0, 8).map(sample => `  - ${sample}`).join("\n");
}

function buildWeeklyUserMessage(
  summary: WeekSummary,
  previousWeeks: WeekSummary[],
  repoContexts: Map<string, RepositoryContext> = new Map()
): string {
  let msg = `Week: ${summary.weekStart} ~ ${summary.weekEnd}\n`;
  msg += `Stats: ${formatWeekStats(summary)}\n`;
  msg += `Active repos: ${summary.repoBreakdown.length}\n`;
  msg += `Top repo by activity count: ${summary.topRepo}\n\n`;

  if (previousWeeks.length > 0) {
    msg += "Recent continuity context (compare only within the same repo or explicit project family):\n";
    for (const week of previousWeeks) {
      const samples = week.sampleMessages.slice(0, 3).map(firstLine).join(" | ");
      const repos = week.repoBreakdown.slice(0, 4).map(repo => `${repo.repo} (${repo.totalEvents})`).join(", ");
      msg += `- ${week.weekStart} ~ ${week.weekEnd}: ${formatWeekStats(week)}, top repo ${week.topRepo}, repos: ${repos}`;
      if (samples) msg += `, sample commits: ${samples}`;
      msg += "\n";
    }
    msg += "\n";
    msg += "When useful, mention whether this week continues, escalates, or changes those patterns, but only for matching repos or explicit project families.\n\n";
  }

  msg += "Current week repository breakdown. Keep these project boundaries separate:\n";
  for (const repo of summary.repoBreakdown) {
    msg += `\nRepository: ${repo.repo}\n`;
    msg += `Activity: ${repo.totalEvents} events, ${formatCountSummary(repo)}, primary semantic: ${repo.topSemantic || "mixed"}\n`;
    msg += `Repository context: ${formatRepositoryContext(repoContexts.get(repo.repo))}\n`;
    const samples = formatRepoSamples(repo);
    if (samples) msg += `Samples:\n${samples}\n`;
  }

  return msg;
}

function getRepositoryContextOptions(config: GitPulseConfig): RepositoryContextOptions {
  const raw = config.aiRoast.repositoryContext;
  const enabled = raw?.enabled !== false;
  const maxReposPerWeek = Number(raw?.maxReposPerWeek ?? DEFAULT_REPO_CONTEXT_MAX_REPOS_PER_WEEK);
  const readmeChars = Number(raw?.readmeChars ?? DEFAULT_REPO_CONTEXT_README_CHARS);

  return {
    enabled,
    maxReposPerWeek: Number.isFinite(maxReposPerWeek) && maxReposPerWeek > 0
      ? Math.floor(maxReposPerWeek)
      : DEFAULT_REPO_CONTEXT_MAX_REPOS_PER_WEEK,
    readmeChars: Number.isFinite(readmeChars) && readmeChars > 0
      ? Math.floor(readmeChars)
      : DEFAULT_REPO_CONTEXT_README_CHARS,
  };
}

function normalizeText(value: string, maxChars: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxChars);
}

async function fetchGitHubJson<T>(url: string, token: string): Promise<T | null> {
  const response = await fetch(url, {
    headers: {
      Authorization: `bearer ${token}`,
      "User-Agent": "GitPulse/1.0",
    },
  });

  if (!response.ok) return null;
  return await response.json() as T;
}

async function fetchRepositoryContext(
  repo: string,
  token: string | undefined,
  readmeChars: number
): Promise<RepositoryContext | null> {
  if (!token) return null;
  const [owner, name] = repo.split("/");
  if (!owner || !name) return null;

  const repoUrl = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
  const readmeUrl = `${repoUrl}/readme`;
  const metadata = await fetchGitHubJson<{
    description?: string | null;
    language?: string | null;
    topics?: string[];
  }>(repoUrl, token);

  if (!metadata) return null;

  const readme = await fetchGitHubJson<{
    content?: string;
    encoding?: string;
  }>(readmeUrl, token);
  let readmeExcerpt: string | null = null;
  if (readme?.content && readme.encoding === "base64") {
    readmeExcerpt = normalizeText(Buffer.from(readme.content, "base64").toString("utf8"), readmeChars);
  }

  return {
    repo,
    description: metadata.description || null,
    primaryLanguage: metadata.language || null,
    topics: metadata.topics || [],
    readmeExcerpt,
  };
}

async function getRepositoryContextsForWeek(
  summary: WeekSummary,
  options: RepositoryContextOptions,
  cache: Map<string, RepositoryContext | null>
): Promise<Map<string, RepositoryContext>> {
  const contexts = new Map<string, RepositoryContext>();
  if (!options.enabled) return contexts;

  const token = process.env.GITHUB_TOKEN;
  if (!token) return contexts;

  const repos = summary.repoBreakdown.slice(0, options.maxReposPerWeek).map(repo => repo.repo);
  for (const repo of repos) {
    if (!cache.has(repo)) {
      try {
        cache.set(repo, await fetchRepositoryContext(repo, token, options.readmeChars));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`  [ai-roast] Repository context skipped for ${repo}: ${message}`);
        cache.set(repo, null);
      }
    }

    const context = cache.get(repo);
    if (context) contexts.set(repo, context);
  }

  return contexts;
}

async function callLLM(
  config: GitPulseConfig,
  systemPrompt: string,
  userMessage: string
): Promise<string> {
  const baseUrl = process.env.LLM_BASE_URL || config.llm.baseUrl;
  const model = process.env.LLM_MODEL || config.llm.model;
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) {
    throw new Error("LLM_API_KEY not set");
  }

  const url = `${baseUrl.replace(/\/+$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      max_tokens: 384000,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API error ${response.status}: ${text}`);
  }

  const json = await response.json() as {
    choices?: Array<{
      finish_reason?: string;
      message?: {
        content?: string | null;
        reasoning_content?: string | null;
      };
    }>;
  };

  const choice = json.choices?.[0];
  const content = choice?.message?.content?.trim();
  if (!content) {
    const reasoningLength = choice?.message?.reasoning_content?.length ?? 0;
    throw new Error(
      `LLM returned empty content (finish_reason: ${choice?.finish_reason ?? "unknown"}, reasoning_content length: ${reasoningLength})`
    );
  }

  return formatAIContent(content);
}

async function delayBetweenRequests(requestCount: number): Promise<void> {
  if (requestCount > 0) {
    await new Promise(resolve => setTimeout(resolve, AI_REQUEST_DELAY_MS));
  }
}

function shouldStopForError(message: string, consecutiveFailures: number): boolean {
  if (message.includes("403")) {
    console.warn("[ai-roast] Budget limit or auth error, stopping");
    return true;
  }
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
    console.warn(`[ai-roast] ${MAX_CONSECUTIVE_FAILURES} consecutive failures, stopping`);
    return true;
  }
  return false;
}

async function waitForRateLimitIfNeeded(message: string): Promise<boolean> {
  if (!message.includes("429")) return false;
  console.warn("[ai-roast] Rate limited, waiting 60s...");
  await new Promise(resolve => setTimeout(resolve, 60_000));
  return true;
}

export async function generateAIRoasts(
  config: GitPulseConfig,
  events: GitPulseEvent[],
  existingRoastsByWeek: Map<string, AIRoastEvent>,
  now = new Date()
): Promise<AIRoastEvent[]> {
  if (!config.aiRoast.enabled) return [];

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.log("[ai-roast] LLM_API_KEY not set, skipping AI roasts");
    return [];
  }

  const basePrompt = config.aiRoast.promptMode === "custom"
    ? config.aiRoast.customPrompt
    : SYSTEM_PROMPTS[config.aiRoast.promptMode] || SYSTEM_PROMPTS.toxic_senior_dev;
  const systemPrompt = withOutputStyleGuide(basePrompt);

  const weeks = groupEventsByWeek(events);
  const chronologicalWeeks = [...weeks].sort((a, b) => a.weekStart.localeCompare(b.weekStart));
  const repositoryContextOptions = getRepositoryContextOptions(config);
  const repositoryContextCache = new Map<string, RepositoryContext | null>();
  const roasts: AIRoastEvent[] = [];
  let consecutiveFailures = 0;
  let requestCount = 0;

  for (const summary of weeks) {
    const weekRange = `${summary.weekStart} ~ ${summary.weekEnd}`;
    const existingRoast = existingRoastsByWeek.get(weekRange);
    const isComplete = isCompletedPeriod(summary.weekEnd, now);

    if (existingRoast && (!isComplete || existingRoast.data.status !== "draft")) continue;
    if (summary.totalCommits + summary.totalPRs + summary.totalReviews < 3) continue;

    await delayBetweenRequests(requestCount);
    requestCount++;

    try {
      const repoContexts = await getRepositoryContextsForWeek(
        summary,
        repositoryContextOptions,
        repositoryContextCache
      );
      const userMessage = buildWeeklyUserMessage(
        summary,
        getPreviousWeeks(summary, chronologicalWeeks),
        repoContexts
      );
      const content = await callLLM(config, systemPrompt, userMessage);

      roasts.push({
        id: `ai-roast-${summary.weekStart}`,
        type: "ai_roast",
        ts: `${summary.weekEnd}T00:00:00Z`,
        repo: null,
        semantic: null,
        data: {
          weekRange,
          content,
          status: isComplete ? "final" : "draft",
          stats: {
            totalCommits: summary.totalCommits,
            topRepo: summary.topRepo,
          },
        },
      });
      console.log(`  [ai-roast] Generated for ${weekRange}`);
      consecutiveFailures = 0;
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`  [ai-roast] Failed for ${weekRange}:`, msg);
      consecutiveFailures++;

      if (await waitForRateLimitIfNeeded(msg)) {
        consecutiveFailures = 0;
        continue;
      }
      if (shouldStopForError(msg, consecutiveFailures)) break;
    }
  }

  return roasts;
}

function getSummaryPeriods(config: GitPulseConfig): AISummaryPeriod[] {
  const summaryConfig = config.aiRoast.summaries;
  if (summaryConfig?.enabled === false) return [];

  const requested = summaryConfig?.periods?.length ? summaryConfig.periods : DEFAULT_SUMMARY_PERIODS;
  const valid = new Set<AISummaryPeriod>(DEFAULT_SUMMARY_PERIODS);
  return [...new Set(requested.filter((period): period is AISummaryPeriod => valid.has(period as AISummaryPeriod)))];
}

function getSummaryMaxPerRun(config: GitPulseConfig): number {
  const raw = config.aiRoast.summaries?.maxPerRun;
  if (raw === undefined) return Number.POSITIVE_INFINITY;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function compareSummaryCandidates(a: PeriodSummary, b: PeriodSummary): number {
  const endCompare = b.end.localeCompare(a.end);
  if (endCompare !== 0) return endCompare;

  const periodCompare = SUMMARY_PERIOD_PRIORITY[a.period] - SUMMARY_PERIOD_PRIORITY[b.period];
  if (periodCompare !== 0) return periodCompare;

  return b.start.localeCompare(a.start);
}

function getPeriodRange(period: AISummaryPeriod, date: Date): { key: string; label: string; start: string; end: string } {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();

  if (period === "month") {
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0));
    const key = `${year}-${String(month + 1).padStart(2, "0")}`;
    return { key, label: key, start: getDateOnly(start), end: getDateOnly(end) };
  }

  if (period === "quarter") {
    const quarter = Math.floor(month / 3) + 1;
    const startMonth = (quarter - 1) * 3;
    const endMonth = startMonth + 2;
    const start = new Date(Date.UTC(year, startMonth, 1));
    const end = new Date(Date.UTC(year, endMonth + 1, 0));
    const key = `${year}-Q${quarter}`;
    return { key, label: key, start: getDateOnly(start), end: getDateOnly(end) };
  }

  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year, 12, 0));
  const key = String(year);
  return { key, label: key, start: getDateOnly(start), end: getDateOnly(end) };
}

function isCompletedPeriod(end: string, now: Date): boolean {
  const periodEnd = Date.parse(`${end}T00:00:00Z`);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return periodEnd < today;
}

function buildPeriodSummaries(events: GitPulseEvent[], period: AISummaryPeriod, now: Date): PeriodSummary[] {
  const groups = new Map<string, { range: ReturnType<typeof getPeriodRange>; events: GitPulseEvent[] }>();

  for (const event of events) {
    if (isAIEvent(event)) continue;
    const range = getPeriodRange(period, new Date(event.ts));
    if (!isCompletedPeriod(range.end, now)) continue;
    if (!groups.has(range.key)) groups.set(range.key, { range, events: [] });
    groups.get(range.key)!.events.push(event);
  }

  const summaries: PeriodSummary[] = [];
  for (const { range, events: periodEvents } of groups.values()) {
    const stats = getStats(periodEvents);
    if (totalActivity(stats) < 3) continue;
    const id = `ai-summary-${period}-${range.key}`;
    const sampleMessages = periodEvents
      .filter(e => e.type === "commit")
      .slice(0, 40)
      .map(e => e.type === "commit" ? e.data.message : "")
      .filter(Boolean);
    const sampleReviews = periodEvents
      .filter(e => e.type === "review")
      .slice(0, 12)
      .map(e => e.type === "review" ? `${e.data.state}: ${e.data.body}`.slice(0, 140) : "")
      .filter(Boolean);

    summaries.push({
      id,
      period,
      label: range.label,
      start: range.start,
      end: range.end,
      ts: `${range.end}T00:00:00Z`,
      events: periodEvents,
      stats,
      topSemantic: getTopSemantic(periodEvents),
      sampleMessages,
      sampleReviews,
    });
  }

  return summaries.sort((a, b) => b.start.localeCompare(a.start));
}

function formatPeriodStats(stats: AISummaryStats): string {
  return `${stats.totalCommits} commits, ${stats.totalPRs} PRs, ${stats.totalReviews} reviews, ${stats.totalIssues} issues, ${stats.totalComments} comments, ${stats.activeRepos} active repos`;
}

function buildHighlights(summary: PeriodSummary): string[] {
  return [
    `${formatPeriodStats(summary.stats)}`,
    `Top repo: ${summary.stats.topRepo}`,
  ];
}

function buildPatterns(summary: PeriodSummary): string[] {
  const patterns = [`Primary activity type: ${summary.topSemantic || "mixed"}`];
  if (summary.stats.totalCommits > summary.stats.totalPRs + summary.stats.totalReviews) {
    patterns.push("Commit-heavy period");
  }
  if (summary.stats.totalReviews > 0) {
    patterns.push("Review activity present");
  }
  return patterns;
}

function buildRisks(summary: PeriodSummary): string[] {
  const risks: string[] = [];
  if (summary.topSemantic === "fix" && summary.stats.totalCommits >= 10) {
    risks.push("Fix-heavy activity may indicate stabilization or repeated churn");
  }
  if (summary.stats.totalCommits >= 20 && summary.stats.totalPRs === 0) {
    risks.push("High commit count with no PR activity");
  }
  return risks;
}

function getPreviousPeriod(summary: PeriodSummary, chronological: PeriodSummary[]): PeriodSummary | undefined {
  return chronological.filter(item => item.start < summary.start).at(-1);
}

function buildContinuity(summary: PeriodSummary, previous?: PeriodSummary): AISummaryEvent["data"]["continuity"] | undefined {
  if (!previous) return undefined;

  const carriedThemes: string[] = [];
  const changedSincePrevious: string[] = [];

  if (previous.stats.topRepo === summary.stats.topRepo && summary.stats.topRepo !== "unknown") {
    carriedThemes.push(`Top repo stayed on ${summary.stats.topRepo}`);
  } else if (summary.stats.topRepo !== "unknown") {
    changedSincePrevious.push(`Top repo shifted from ${previous.stats.topRepo} to ${summary.stats.topRepo}`);
  }

  if (previous.topSemantic && previous.topSemantic === summary.topSemantic) {
    carriedThemes.push(`Dominant semantic tag stayed ${summary.topSemantic}`);
  } else if (previous.topSemantic || summary.topSemantic) {
    changedSincePrevious.push(`Dominant semantic tag changed from ${previous.topSemantic || "mixed"} to ${summary.topSemantic || "mixed"}`);
  }

  const commitDelta = summary.stats.totalCommits - previous.stats.totalCommits;
  if (Math.abs(commitDelta) >= 10) {
    changedSincePrevious.push(`Commit volume ${commitDelta > 0 ? "increased" : "decreased"} by ${Math.abs(commitDelta)}`);
  }

  return carriedThemes.length || changedSincePrevious.length ? { carriedThemes, changedSincePrevious } : undefined;
}

function buildSubperiodLines(summary: PeriodSummary): string[] {
  if (summary.period === "month") {
    return groupEventsByWeek(summary.events)
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart))
      .map(week => `- ${week.weekStart} ~ ${week.weekEnd}: ${formatWeekStats(week)}, top repo ${week.topRepo}`);
  }

  const months = new Map<string, GitPulseEvent[]>();
  for (const event of summary.events) {
    const key = event.ts.slice(0, 7);
    if (!months.has(key)) months.set(key, []);
    months.get(key)!.push(event);
  }
  return [...months.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, monthEvents]) => `- ${month}: ${formatPeriodStats(getStats(monthEvents))}`);
}

function buildSummaryUserMessage(summary: PeriodSummary, previous?: PeriodSummary): string {
  let msg = `${summary.period.toUpperCase()} summary: ${summary.label}\n`;
  msg += `Range: ${summary.start} ~ ${summary.end}\n`;
  msg += `Stats: ${formatPeriodStats(summary.stats)}\n`;
  msg += `Top repo: ${summary.stats.topRepo}\n`;
  msg += `Dominant semantic tag: ${summary.topSemantic || "mixed"}\n\n`;

  if (previous) {
    msg += `Previous ${summary.period} context: ${previous.label}\n`;
    msg += `Stats: ${formatPeriodStats(previous.stats)}\n`;
    msg += `Top repo: ${previous.stats.topRepo}\n`;
    msg += `Dominant semantic tag: ${previous.topSemantic || "mixed"}\n\n`;
  }

  const subperiodLines = buildSubperiodLines(summary);
  if (subperiodLines.length > 0) {
    msg += `Sub-period breakdown:\n${subperiodLines.join("\n")}\n\n`;
  }

  if (summary.sampleMessages.length > 0) {
    msg += `Representative commit messages:\n${summary.sampleMessages.map(m => `- ${firstLine(m)}`).join("\n")}\n\n`;
  }
  if (summary.sampleReviews.length > 0) {
    msg += `Review samples:\n${summary.sampleReviews.map(r => `- ${r}`).join("\n")}\n\n`;
  }

  msg += "Write a complete retrospective for this period. Mention continuity or change when the previous-period context is useful.";
  return msg;
}

export async function generateAISummaries(
  config: GitPulseConfig,
  events: GitPulseEvent[],
  existingSummaryIds: Set<string>,
  now = new Date()
): Promise<AISummaryEvent[]> {
  if (!config.aiRoast.enabled) return [];

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.log("[ai-roast] LLM_API_KEY not set, skipping AI summaries");
    return [];
  }

  const periods = getSummaryPeriods(config);
  if (periods.length === 0) return [];

  const maxPerRun = getSummaryMaxPerRun(config);
  if (maxPerRun === 0) {
    console.log("[ai-roast] AI summary generation capped at 0, skipping AI summaries");
    return [];
  }

  const summariesByPeriod = new Map<AISummaryPeriod, PeriodSummary[]>();
  const chronologicalByPeriod = new Map<AISummaryPeriod, PeriodSummary[]>();
  for (const period of periods) {
    const summaries = buildPeriodSummaries(events, period, now);
    summariesByPeriod.set(period, summaries);
    chronologicalByPeriod.set(period, [...summaries].sort((a, b) => a.start.localeCompare(b.start)));
  }

  const pendingSummaries = [...summariesByPeriod.values()]
    .flatMap(summaries => summaries)
    .filter(summary => !existingSummaryIds.has(summary.id))
    .sort(compareSummaryCandidates);
  const aiSummaries: AISummaryEvent[] = [];
  let consecutiveFailures = 0;
  let requestCount = 0;

  for (const summary of pendingSummaries) {
    if (aiSummaries.length >= maxPerRun) {
      console.log(`[ai-summary] Reached per-run summary limit (${maxPerRun})`);
      return aiSummaries;
    }

    const period = summary.period;
    const chronological = chronologicalByPeriod.get(period) || [];
    const systemPrompt = withOutputStyleGuide(SUMMARY_PROMPTS[period]);

    await delayBetweenRequests(requestCount);
    requestCount++;

    try {
      const previous = getPreviousPeriod(summary, chronological);
      const content = await callLLM(config, systemPrompt, buildSummaryUserMessage(summary, previous));
      const continuity = buildContinuity(summary, previous);

      aiSummaries.push({
        id: summary.id,
        type: "ai_summary",
        ts: summary.ts,
        repo: null,
        semantic: null,
        data: {
          period,
          range: {
            start: summary.start,
            end: summary.end,
            label: summary.label,
          },
          content,
          highlights: buildHighlights(summary),
          patterns: buildPatterns(summary),
          risks: buildRisks(summary),
          stats: summary.stats,
          ...(continuity ? { continuity } : {}),
        },
      });
      console.log(`  [ai-summary] Generated ${period} summary for ${summary.label}`);
      consecutiveFailures = 0;
    } catch (err) {
      const msg = (err as Error).message;
      console.warn(`  [ai-summary] Failed for ${period} ${summary.label}:`, msg);
      consecutiveFailures++;

      if (await waitForRateLimitIfNeeded(msg)) {
        consecutiveFailures = 0;
        continue;
      }
      if (shouldStopForError(msg, consecutiveFailures)) return aiSummaries;
    }
  }

  return aiSummaries;
}
