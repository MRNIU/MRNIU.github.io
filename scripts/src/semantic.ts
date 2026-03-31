import type { SemanticTag } from "./types.js";

const CONVENTIONAL_RE = /^(feat|fix|refactor|docs|test|chore|style|perf|ci)(\(.+?\))?[!]?:/i;
const MERGE_RE = /^merge\s/i;

export function extractSemantic(message: string): SemanticTag {
  if (!message) return null;
  if (MERGE_RE.test(message)) return "merge";
  const match = message.match(CONVENTIONAL_RE);
  if (match) return match[1].toLowerCase() as SemanticTag;
  return null;
}
