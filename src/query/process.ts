import { embedLite, embedFull } from "../ingest/embedder";
import { liteSearch, refineSearch, deepSearch } from "../retrieval/search";
import { decide, isTimeSensitive } from "../retrieval/scorer";
import { assembleContext } from "../context/assembler";
import { generate } from "../llm/generate";
import { CONFIG } from "../../config/settings";
import type { ChunkResult } from "../retrieval/scorer";

// Simple in-memory cache — skipped for time-sensitive queries
const cache = new Map<string, { answer: string; ts: number }>();

function tokenize(query: string): Set<string> {
  return new Set(query.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
}

export interface QueryResult {
  answer: string;
  stage: 1 | 2 | 3;
  cached: boolean;
}

export async function runQuery(query: string, category?: string): Promise<QueryResult> {
  const timeSensitive = isTimeSensitive(query);
  const cacheKey = `${query}::${category ?? ""}`;

  // Cache lookup — skip for time-sensitive
  if (!timeSensitive) {
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < CONFIG.cache.ttlMs) {
      return { answer: hit.answer, stage: 1, cached: true };
    }
  }

  const queryTokens = tokenize(query);
  const liteVec = await embedLite(query);
  const s1Results = await liteSearch(liteVec, category);

  const decision = decide(query, s1Results, queryTokens);

  let chunks: ChunkResult[];
  let stage: 1 | 2 | 3;

  if (decision === "accept") {
    chunks = assembleContext(s1Results);
    stage = 1;
  } else {
    const fullVec = await embedFull(query);

    if (decision === "refine") {
      const s2Results = await refineSearch(fullVec, s1Results.map((r) => r.id));
      const s2Decision = decide(query, s2Results, queryTokens);

      if (s2Decision === "accept" || s2Decision === "refine") {
        chunks = assembleContext(s2Results);
        stage = 2;
      } else {
        const s3Results = await deepSearch(fullVec);
        chunks = assembleContext([...s2Results, ...s3Results]);
        stage = 3;
      }
    } else {
      // escalate straight to Stage 3
      const s3Results = await deepSearch(fullVec);
      chunks = assembleContext([...s1Results, ...s3Results]);
      stage = 3;
    }
  }

  const answer = await generate(query, chunks);

  if (!timeSensitive) {
    cache.set(cacheKey, { answer, ts: Date.now() });
  }

  return { answer, stage, cached: false };
}
