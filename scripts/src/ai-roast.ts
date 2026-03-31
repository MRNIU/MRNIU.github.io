import type { GitPulseConfig } from "./config.js";
import type { AIRoastEvent, GitPulseEvent } from "./types.js";

const SYSTEM_PROMPTS: Record<string, string> = {
  toxic_senior_dev: `You are a brutally honest senior developer reviewing a junior's weekly activity log.
Your style: sarcastic, witty, technically sharp. Point out patterns like repetitive commit messages,
too many "fix" commits, suspiciously small PRs, or overambitious refactors.
Keep it under 3 sentences. Be funny, not mean. Write in the same language as the commit messages —
if they're in English, respond in English; if Chinese, respond in Chinese.`,

  encouraging_mentor: `You are a warm and encouraging senior mentor reviewing a developer's weekly activity.
Highlight what they did well, note impressive patterns (deep reviews, big features, cross-repo work).
Give one gentle suggestion for improvement. Keep it under 3 sentences.
Write in the same language as the commit messages.`,
};

interface WeekSummary {
  weekStart: string;
  weekEnd: string;
  totalCommits: number;
  totalPRs: number;
  totalReviews: number;
  topRepo: string;
  sampleMessages: string[];
  sampleReviews: string[];
}

function groupEventsByWeek(events: GitPulseEvent[]): WeekSummary[] {
  const weeks = new Map<string, GitPulseEvent[]>();

  for (const event of events) {
    if (event.type === "ai_roast") continue;
    const date = new Date(event.ts);
    // Get Monday of the week
    const day = date.getDay();
    const monday = new Date(date);
    monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
    const weekKey = monday.toISOString().slice(0, 10);

    if (!weeks.has(weekKey)) weeks.set(weekKey, []);
    weeks.get(weekKey)!.push(event);
  }

  const summaries: WeekSummary[] = [];
  for (const [weekStart, weekEvents] of weeks) {
    const endDate = new Date(weekStart);
    endDate.setDate(endDate.getDate() + 6);
    const weekEnd = endDate.toISOString().slice(0, 10);

    const commits = weekEvents.filter(e => e.type === "commit");
    const prs = weekEvents.filter(e => e.type === "pull_request");
    const reviews = weekEvents.filter(e => e.type === "review");

    // Count events per repo
    const repoCounts = new Map<string, number>();
    for (const e of weekEvents) {
      if (e.repo) repoCounts.set(e.repo, (repoCounts.get(e.repo) || 0) + 1);
    }
    const topRepo = [...repoCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";

    // Sample commit messages (max 30)
    const sampleMessages = commits
      .slice(0, 30)
      .map(e => e.type === "commit" ? e.data.message : "")
      .filter(Boolean);

    // Sample review bodies (max 10)
    const sampleReviews = reviews
      .slice(0, 10)
      .map(e => e.type === "review" ? `${e.data.state}: ${e.data.body}`.slice(0, 100) : "")
      .filter(Boolean);

    summaries.push({
      weekStart,
      weekEnd,
      totalCommits: commits.length,
      totalPRs: prs.length,
      totalReviews: reviews.length,
      topRepo,
      sampleMessages,
      sampleReviews,
    });
  }

  return summaries.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

function buildUserMessage(summary: WeekSummary): string {
  let msg = `Week: ${summary.weekStart} ~ ${summary.weekEnd}\n`;
  msg += `Stats: ${summary.totalCommits} commits, ${summary.totalPRs} PRs, ${summary.totalReviews} reviews\n`;
  msg += `Top repo: ${summary.topRepo}\n\n`;

  if (summary.sampleMessages.length > 0) {
    msg += `Commit messages:\n${summary.sampleMessages.map(m => `- ${m}`).join("\n")}\n\n`;
  }
  if (summary.sampleReviews.length > 0) {
    msg += `Review samples:\n${summary.sampleReviews.map(r => `- ${r}`).join("\n")}`;
  }

  return msg;
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
      max_tokens: 300,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`LLM API error ${response.status}: ${text}`);
  }

  const json = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return json.choices[0]?.message?.content || "";
}

export async function generateAIRoasts(
  config: GitPulseConfig,
  events: GitPulseEvent[],
  existingRoastWeeks: Set<string>
): Promise<AIRoastEvent[]> {
  if (!config.aiRoast.enabled) return [];

  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    console.log("[ai-roast] LLM_API_KEY not set, skipping AI roasts");
    return [];
  }

  const systemPrompt = config.aiRoast.promptMode === "custom"
    ? config.aiRoast.customPrompt
    : SYSTEM_PROMPTS[config.aiRoast.promptMode] || SYSTEM_PROMPTS.toxic_senior_dev;

  const weeks = groupEventsByWeek(events);
  const roasts: AIRoastEvent[] = [];

  for (const summary of weeks) {
    const weekRange = `${summary.weekStart} ~ ${summary.weekEnd}`;

    // Skip weeks that already have a roast
    if (existingRoastWeeks.has(weekRange)) continue;

    // Skip weeks with very little activity
    if (summary.totalCommits + summary.totalPRs + summary.totalReviews < 3) continue;

    try {
      const userMessage = buildUserMessage(summary);
      const content = await callLLM(config, systemPrompt, userMessage);

      if (content) {
        roasts.push({
          id: `ai-roast-${summary.weekStart}`,
          type: "ai_roast",
          ts: `${summary.weekEnd}T00:00:00Z`,
          repo: null,
          semantic: null,
          data: {
            weekRange,
            content,
            stats: {
              totalCommits: summary.totalCommits,
              topRepo: summary.topRepo,
            },
          },
        });
        console.log(`  [ai-roast] Generated for ${weekRange}`);
      }
    } catch (err) {
      console.warn(`  [ai-roast] Failed for ${weekRange}:`, (err as Error).message);
      // Graceful degradation: skip this week, continue with others
    }
  }

  return roasts;
}
