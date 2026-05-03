export const CONFIG = {
  embedding: {
    model: "text-embedding-3-small",
    dimsFull: 1536,
    dimsLite: 128,
  },
  llm: {
    model: "gpt-4.1-mini",
  },
  retrieval: {
    stage1TopK: 3,
    stage2TopK: 4,
    stage2ExpandCount: 2,
    stage3TopK: 6,
    maxContextChunks: 5,
  },
  decision: {
    acceptThreshold: 0.85,
    refineThreshold: 0.65,
    ambiguityGap: 0.05,
    recencyEscalateBelow: 0.3,
    recencyHalfLifeDays: 365,
    timeSensitiveKeywords: ["today", "latest", "current", "pricing", "now", "recent", "live"],
  },
  cache: {
    ttlMs: 1000 * 60 * 10, // 10 min — skipped for time-sensitive queries
  },
} as const;
