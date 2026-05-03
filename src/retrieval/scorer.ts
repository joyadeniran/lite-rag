import { CONFIG } from "../../config/settings";

export interface ChunkResult {
  id: string;
  content: string;
  similarity: number;
  category: string | null;
  source: string | null;
  created_at: string;
}

const { recencyHalfLifeDays, timeSensitiveKeywords, ambiguityGap, recencyEscalateBelow, acceptThreshold, refineThreshold } =
  CONFIG.decision;

export function recencyScore(createdAt: string): number {
  const ageDays = (Date.now() - new Date(createdAt).getTime()) / 86_400_000;
  return Math.max(0, 1 - ageDays / recencyHalfLifeDays);
}

// Real metadata score: 1.0 if query terms overlap with category/tags, else 0.3
export function metadataScore(chunk: ChunkResult, queryTokens: Set<string>): number {
  const fields = [chunk.category ?? ""].join(" ").toLowerCase();
  const overlap = [...queryTokens].some((t) => fields.includes(t));
  return overlap ? 1.0 : 0.3;
}

export function confidence(chunk: ChunkResult, queryTokens: Set<string>): number {
  return (
    0.6 * chunk.similarity +
    0.2 * metadataScore(chunk, queryTokens) +
    0.2 * recencyScore(chunk.created_at)
  );
}

export function isTimeSensitive(query: string): boolean {
  const q = query.toLowerCase();
  return timeSensitiveKeywords.some((k) => q.includes(k));
}

export type Decision = "accept" | "refine" | "escalate";

export function decide(query: string, results: ChunkResult[], queryTokens: Set<string>): Decision {
  if (!results.length) return "escalate";

  const [top, second] = results;

  // Hard checks first
  if (isTimeSensitive(query) && recencyScore(top.created_at) < recencyEscalateBelow) return "escalate";
  if (second && top.similarity - second.similarity < ambiguityGap) return "escalate";

  const score = confidence(top, queryTokens);
  if (score >= acceptThreshold) return "accept";
  if (score >= refineThreshold) return "refine";
  return "escalate";
}
