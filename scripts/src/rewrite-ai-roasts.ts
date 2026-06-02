import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import { OUTPUT_STYLE_GUIDE } from "./ai-roast.js";
import type { AIRoastEvent, MonthlyData } from "./types.js";

const DATA_DIR = path.resolve(process.cwd(), "data");
const RATE_LIMIT_DELAY_MS = Number(process.env.AI_ROAST_REWRITE_DELAY_MS ?? "5000");
const REQUEST_TIMEOUT_MS = Number(process.env.AI_ROAST_REWRITE_TIMEOUT_MS ?? "120000");
const CONCURRENCY = Math.max(1, Number(process.env.AI_ROAST_REWRITE_CONCURRENCY ?? "1"));
const maxRoasts = process.env.AI_ROAST_REWRITE_LIMIT
  ? Number(process.env.AI_ROAST_REWRITE_LIMIT)
  : Number.POSITIVE_INFINITY;

interface RoastRef {
  filePath: string;
  data: MonthlyData;
  event: AIRoastEvent;
}

function collectRoasts(): RoastRef[] {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => /^\d{4}-\d{2}\.json$/.test(file))
    .sort();
  const roasts: RoastRef[] = [];

  for (const file of files) {
    const filePath = path.join(DATA_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as MonthlyData;
    for (const event of data.events) {
      if (event.type === "ai_roast") {
        roasts.push({ filePath, data, event });
      }
    }
  }

  return roasts;
}

async function rewriteRoast(event: AIRoastEvent): Promise<string> {
  const config = loadConfig();
  const baseUrl = process.env.LLM_BASE_URL || config.llm.baseUrl;
  const model = process.env.LLM_MODEL || config.llm.model;
  const apiKey = process.env.LLM_API_KEY;

  if (!apiKey) {
    throw new Error("LLM_API_KEY not set");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "system",
            content: `${OUTPUT_STYLE_GUIDE}

You rewrite existing AI roast text. Preserve the original meaning, language, tone, jokes, and factual claims. Do not add new activity facts or extra commentary. Return only the rewritten roast text.`,
          },
          {
            role: "user",
            content: `Week: ${event.data.weekRange}
Stats: ${event.data.stats.totalCommits} commits, top repo ${event.data.stats.topRepo}

Original roast:
${event.data.content}`,
          },
        ],
        max_tokens: 384000,
        temperature: 0.2,
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`LLM API request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }

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

  return content;
}

function writeUpdatedFiles(updatedFiles: Map<string, MonthlyData>): void {
  for (const [filePath, data] of updatedFiles) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
  }
}

async function main() {
  const roasts = collectRoasts().slice(0, maxRoasts);
  const updatedFiles = new Map<string, MonthlyData>();
  let processed = 0;
  let updatedCount = 0;
  let failed = 0;
  let nextIndex = 0;
  let nextRequestAt = 0;

  console.log(`[ai-roast] Rewriting ${roasts.length} existing roast(s) with concurrency ${CONCURRENCY}`);

  async function waitForRequestSlot(): Promise<void> {
    if (RATE_LIMIT_DELAY_MS <= 0) return;

    const now = Date.now();
    const waitMs = Math.max(0, nextRequestAt - now);
    nextRequestAt = Math.max(now, nextRequestAt) + RATE_LIMIT_DELAY_MS;
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  async function worker(): Promise<void> {
    while (true) {
      const index = nextIndex++;
      if (index >= roasts.length) return;

      const { filePath, data, event } = roasts[index];
      await waitForRequestSlot();

      try {
        const updated = await rewriteRoast(event);
        if (updated !== event.data.content) {
          event.data.content = updated;
          updatedFiles.set(filePath, data);
          updatedCount++;
        }

        console.log(`  [ai-roast] Rewritten ${event.data.weekRange}`);
      } catch (err) {
        failed++;
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`  [ai-roast] Skipped ${event.data.weekRange}: ${message}`);
      }

      processed++;
    }
  }

  const workerCount = Math.min(CONCURRENCY, roasts.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  writeUpdatedFiles(updatedFiles);
  console.log(`[ai-roast] Updated ${updatedCount} roast(s) in ${updatedFiles.size} monthly data file(s); skipped ${failed}`);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
