# Lite-RAG System Specification (v1.3)

> Last updated: 2026-05-03. Reflects production implementation.  
> For change history see `CHANGELOG.md`.

---

## Definition

Lite-RAG is a decision-driven, multi-stage retrieval system that minimises cost and latency by combining metadata filtering, MRL-truncated embeddings, hybrid reranking, and confidence-based escalation.

---

## Core Principles

1. Do the cheapest work first
2. Escalate only when necessary
3. Separate ordering (hybrid score) from confidence (raw vector similarity)
4. Limit context aggressively
5. Optimise for real-world latency, not theoretical accuracy

---

## Architecture

```
Query
  → isTimeSensitive? → skip cache
  → cache hit? → return
  → embedLite
  → liteSearch (Stage 1, top-3)
  → hybridRerank (0.7×vector + 0.3×BM25)
  → adaptiveK trim
  → decide()
      ├── accept → assemble → generate → cache → return
      ├── refine → embedFull → refineSearch (Stage 2) → decide()
      │               ├── accept/refine → assemble → generate → cache → return
      │               └── escalate → deepSearch (Stage 3) → assemble → generate → return
      └── escalate → embedFull → deepSearch (Stage 3) → assemble → generate → return
```

---

## Embeddings

| Type | API param | Dimensions | When |
|------|-----------|------------|------|
| Lite | `dimensions: 128` | 128 | query + ingest |
| Full | `dimensions: 1536` | 1536 | escalation + ingest |

Both generated in parallel at ingest time. MRL (Matryoshka Representation Learning) truncation via the API `dimensions` parameter — **not** a post-hoc array slice.

---

## Data Ingestion

### Chunking
- Semantic chunking, target 300–600 tokens (~1200–2400 chars)
- Optional 15% overlap
- Undersized remainders merged into the previous chunk

### Storage Schema
```sql
CREATE TABLE documents (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content        TEXT NOT NULL,
  embedding_full VECTOR(1536),
  embedding_lite VECTOR(128),
  category       TEXT,
  source         TEXT,
  tags           TEXT[],
  created_at     TIMESTAMP DEFAULT NOW()
);
```

---

## Retrieval Stages

| Stage | Embedding | Top-K | Trigger |
|-------|-----------|-------|---------|
| 1 | lite 128-dim | adaptive 1–3 | always |
| 2 | full 1536-dim | adaptive 2–4 | refine decision |
| 3 | full, full scan | 6 | escalate decision |

Stage 2 expands beyond Stage 1 candidate IDs: unions S1 IDs with a fresh top-2 full-vector scan, deduplicates, then re-ranks.

---

## Hybrid Search

Applied after Stage 1 vector retrieval, before the decision engine.

```
hybridScore = 0.7 × vector_similarity + 0.3 × bm25_normalized
```

- BM25 computed in-memory over the candidate set only
- `hybridScore` used for **ordering only**
- Raw `similarity` (vector score) preserved for confidence formula and gap check

---

## Decision Engine

### Hard checks (evaluated first, in order)

1. **Recency:** `isTimeSensitive(query) && recencyScore(top) < 0.3` → escalate
2. **Ambiguity:** `gap < 0.05 && top.similarity < acceptThreshold` → escalate
   - Gap = `top.similarity - second.similarity`
   - Not triggered when top result is already high-confidence (two strong results = good coverage)

### Confidence score

```
confidence = 0.6 × similarity + 0.2 × metadata_score + 0.2 × recency_score
```

**metadata_score:**
- `1.0` if any query token matches the chunk's category field
- `0.3` otherwise

**recency_score:**
```
recency = max(0, 1 - age_days / 365)
```

### Thresholds

| Score | Decision |
|-------|----------|
| ≥ 0.85 | accept |
| 0.65 – 0.85 | refine (→ Stage 2) |
| < 0.65 | escalate (→ Stage 3) |

---

## Adaptive Top-K

| Confidence | Stage 1 K | Stage 2 K |
|------------|-----------|-----------|
| ≥ 0.85     | 1         | 2         |
| ≥ 0.65     | 2         | 4         |
| < 0.65     | 3         | 4         |

---

## Context Assembly

- Deduplicate by chunk ID across all stage results
- Sort by similarity descending
- Default: top 2–3 chunks, max 5

---

## Caching

- In-memory store, 10-minute TTL
- Stores: `answer`, `stage`, `category`, `timestamp`
- **Bypassed** (read + write) for time-sensitive queries
- **Invalidated immediately** on ingest, scoped to the ingested category

### Time-sensitive keywords
`today · latest · current · now · recent · live`

---

## Generation

```
system: "Answer using only the provided context. Be concise."
user:   "Context:\n[1] chunk\n\n[2] chunk\n\nQuestion: {query}"
```

Model: `gpt-4.1-mini`  
Fallback: `"I don't have enough information to answer that."` when context is empty.

---

## RPC Functions

| Function | Embedding dim | Purpose |
|----------|---------------|---------|
| `match_lite_documents` | 128 | Stage 1 vector search with optional category filter |
| `match_refine_documents` | 1536 | Stage 2 re-rank S1 IDs + expand by 2 |
| `match_full_documents` | 1536 | Stage 3 full dataset scan |

---

## Known Limitations

| # | Description |
|---|-------------|
| L-001 | Lite embedding uses MRL truncation, not a dedicated small model |
| L-002 | BM25 is in-memory over candidates only — not a full corpus index |
| L-003 | Cache invalidation is category-scoped — cross-category queries not invalidated on unrelated ingests |
