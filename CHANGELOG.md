# Lite-RAG Changelog

---

## [1.0.0] — 2026-05-03

### Initial production build from v0 spec

---

### Fixes

#### FIX-001 — Lite embedding: slice → dimensions param
**File:** `src/ingest/embedder.ts`  
**Problem:** v0 sliced the full embedding array to 128 dims after the fact (`embedding.slice(0, 128)`). This is unreliable — it only preserves information correctly if the model was trained with Matryoshka Representation Learning (MRL) and the specific dimensions parameter was passed.  
**Fix:** Two separate API calls using the `dimensions` parameter directly:
```ts
// Lite
client.embeddings.create({ model, input, dimensions: 128 })
// Full
client.embeddings.create({ model, input, dimensions: 1536 })
```
Both generated in parallel at ingest time via `embedBoth()`.

---

#### FIX-002 — Embedding dimension inconsistency: 768 → 1536
**File:** `db/schema.sql`, `db/queries.sql`  
**Problem:** v0 used `VECTOR(768)` for full embeddings. `text-embedding-3-small` default output is 1536 dimensions. Schema and RPC functions were mismatched.  
**Fix:** Locked to `VECTOR(1536)` full, `VECTOR(128)` lite throughout schema and all RPC functions.

---

#### FIX-003 — shouldEscalate: raw similarity threshold → confidence formula
**File:** `src/retrieval/scorer.ts`  
**Problem:** v0 escalated when `top.similarity < 0.8`. This used raw vector similarity as a proxy for confidence, conflicting with the spec's weighted confidence formula and threshold of 0.65. Most Stage 1 results would fail the 0.8 bar, causing excessive escalation.  
**Fix:** Removed raw similarity check entirely. Single decision path uses the spec formula:
```
confidence = 0.6×similarity + 0.2×metadata_score + 0.2×recency_score
```
Thresholds: `≥0.85` accept · `0.65–0.85` refine · `<0.65` escalate.

---

#### FIX-004 — metadata_score: hardcoded 0.5 → real signal
**File:** `src/retrieval/scorer.ts`  
**Problem:** v0 used `top.metadata_score ?? 0.5` — a constant. This made the confidence formula effectively `0.6×sim + 0.1 + 0.2×recency`, wasting a formula term on a fixed offset.  
**Fix:** Computed from actual query/category token overlap:
- `1.0` if any query token appears in the chunk's category field
- `0.3` if no overlap

---

#### FIX-005 — Stage 2: re-rank only → re-rank + expand
**File:** `db/queries.sql` (`match_refine_documents`)  
**Problem:** Stage 2 only re-ranked the exact Stage 1 candidate IDs with full embeddings. If Stage 1 retrieved the wrong chunks, Stage 2 just re-ordered the same wrong set.  
**Fix:** `match_refine_documents` now unions Stage 1 candidate IDs with a small fresh full-vector top-K scan (`expand_count=2`), deduplicates, then re-ranks the combined set.

---

#### FIX-006 — No deduplication across stages
**File:** `src/context/assembler.ts`  
**Problem:** Stage 3 results were merged with Stage 1/2 results with no deduplication. The same chunk could appear multiple times in context, wasting tokens.  
**Fix:** `assembleContext()` deduplicates by chunk ID before assembling context, then sorts by similarity descending.

---

#### FIX-007 — Cache: TTL-only invalidation → event-driven
**File:** `src/cache.ts`, `src/ingest/pipeline.ts`  
**Problem:** Cache was a bare `Map` with 10-minute TTL only. Ingesting new documents for a category wouldn't invalidate cached answers for that category until TTL expired — serving stale answers.  
**Fix:** `invalidateByCategory()` is called at the end of every `ingestText()` call, immediately busting all cache entries matching the ingested category.

---

#### FIX-008 — Cache bypass for time-sensitive queries
**File:** `src/query/process.ts`, `src/cache.ts`  
**Problem:** Time-sensitive queries (containing: today, latest, current, now, recent, live) were being served from cache, defeating the recency check entirely.  
**Fix:** Cache lookup and cache write are both skipped when `isTimeSensitive(query)` returns true.

---

#### FIX-009 — "pricing" removed from time-sensitive keywords
**File:** `config/settings.ts`  
**Problem:** "pricing" was in the `timeSensitiveKeywords` list. It's a topic, not a recency signal — it caused nearly every pricing-related query to bypass the cache and trigger full embeddings unnecessarily.  
**Fix:** Removed. Time-sensitive keywords are now: `today, latest, current, now, recent, live`.

---

#### FIX-010 — hybridRerank mutating similarity score
**File:** `src/retrieval/hybrid.ts`, `src/retrieval/scorer.ts`  
**Problem:** `hybridRerank()` overwrote the `similarity` field with the combined hybrid score (`0.7×vector + 0.3×BM25`). The confidence formula and ambiguity gap check downstream both read `similarity` — so they operated on the degraded hybrid value, not the raw vector similarity. A chunk with `sim=0.99` entering hybrid rerank with near-zero BM25 overlap would exit with `similarity≈0.693`, dropping below the accept threshold.  
**Fix:** Hybrid score written to a separate `hybridScore` field (used for ordering only). `similarity` is preserved as the raw vector score throughout the pipeline.

---

#### FIX-011 — Ambiguity check: unconditional → confidence-gated
**File:** `src/retrieval/scorer.ts`  
**Problem:** The ambiguity rule (`top1.sim - top2.sim < 0.05 → escalate`) fired unconditionally. Two results both scoring above the accept threshold (e.g. 0.97 and 0.95) would escalate despite both being high-quality. Close high-confidence results mean good coverage, not ambiguity.  
**Fix:** Ambiguity escalation now requires both conditions:
```ts
gap < ambiguityGap && top.similarity < acceptThreshold
```
If the top result is already above the accept threshold, a narrow gap is ignored.

---

#### FIX-012 — Cache entry missing stage
**File:** `src/cache.ts`, `src/query/process.ts`  
**Problem:** Cache stored only `answer` and `ts`. Cache hits returned `stage: 1` hardcoded regardless of which stage actually resolved the original query.  
**Fix:** Cache entries now store `stage`. Cache hits return the correct stage from the original resolution.

---

### Features Added

#### FEAT-001 — Ingest pipeline
**Files:** `src/ingest/chunker.ts`, `src/ingest/pipeline.ts`  
Semantic chunker (300–600 token target, optional 15% overlap, undersized remainders merged into previous chunk). `ingestText()` chunks → embeds both dims in parallel → inserts to Supabase.

---

#### FEAT-002 — Adaptive Top-K
**File:** `src/retrieval/scorer.ts` (`adaptiveK()`), `src/query/process.ts`  
Top-K is now dynamic per stage based on confidence score rather than fixed:

| Confidence | Stage 1 K | Stage 2 K |
|------------|-----------|-----------|
| ≥ 0.85     | 1         | 2         |
| ≥ 0.65     | 2         | 4         |
| < 0.65     | 3         | 4         |

---

#### FEAT-003 — Hybrid search (BM25 + vector)
**Files:** `src/retrieval/bm25.ts`, `src/retrieval/hybrid.ts`  
Stage 1 results are re-ranked by:
```
hybridScore = 0.7 × vector_similarity + 0.3 × bm25_normalized
```
BM25 computed in-memory over the candidate set (no corpus index). Ordering uses `hybridScore`; confidence formula uses raw `similarity`.

---

#### FEAT-004 — Test suite
**Files:** `tests/scorer.test.ts`, `tests/chunker.test.ts`, `tests/pipeline.test.ts`  
- **scorer:** 13 cases — confidence, recency, metadata, decision engine, ambiguity rule
- **chunker:** 7 cases — sizing, overlap, remainder merging, empty input
- **pipeline:** 8 cases — all 3 stage paths, cache hit/bypass, DB error, empty results (Supabase + OpenAI mocked)

---

### Known Remaining Limitations

| # | Issue |
|---|-------|
| L-001 | Lite embedding uses MRL dimension truncation, not a dedicated small model |
| L-002 | BM25 is in-memory over candidates only — not a full corpus index |
| L-003 | Cache invalidation is category-scoped only — cross-category queries not invalidated on unrelated ingests |
