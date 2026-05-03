# Lite-RAG

A multi-stage retrieval-augmented generation system that starts cheap and escalates only when confidence is low.

**Default path:** one lite embedding pass, 2–3 chunks, fast answer.  
**Escalation path:** full embeddings, deeper search — only when the decision engine demands it.

---

## Architecture

```
Query → metadata filter → Stage 1 (128-dim, top 3) → Decision Engine → [Stage 2 → Stage 3] → assemble → generate
```

### Decision Engine

Hard checks run first (order matters):
1. Time-sensitive query + recency < 0.3 → escalate
2. `top1.similarity - top2.similarity < 0.05` → escalate

Confidence formula:
```
confidence = 0.6×similarity + 0.2×metadata_score + 0.2×recency_score
```

Thresholds: `≥0.85` accept · `0.65–0.85` refine (Stage 2) · `<0.65` escalate (Stage 3)

### Retrieval Stages

| Stage | Embedding | Top-K | When |
|-------|-----------|-------|------|
| 1 | lite 128-dim | 3 | always |
| 2 | full 1536-dim | 4 | refine — re-ranks S1 + expands by 2 |
| 3 | full, full scan | 6 | escalate — merged + deduped with S1 |

---

## Stack

- **Runtime:** Node.js + TypeScript
- **DB:** Supabase (pgvector)
- **Embeddings:** OpenAI `text-embedding-3-small` — `dimensions: 128` (lite) + `dimensions: 1536` (full)
- **LLM:** `gpt-4.1-mini`

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example .env
```

Fill in:
```
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_service_key
OPENAI_API_KEY=your_openai_key
```

### 3. Database setup

In the Supabase SQL editor, run in order:

```bash
db/schema.sql   # creates table + indexes
db/queries.sql  # creates RPC functions
```

### 4. Seed test data

```bash
npm run seed
```

### 5. Start server

```bash
npm run dev
```

---

## API

### `POST /query`

```json
{ "query": "What is our pricing model?", "category": "pricing" }
```

Response:
```json
{ "answer": "...", "stage": 1, "cached": false }
```

### `POST /ingest`

```json
{
  "text": "Your document content here...",
  "category": "pricing",
  "source": "pricing-page",
  "tags": ["billing", "subscription"]
}
```

Response:
```json
{ "inserted": 2 }
```

---

## Benchmark

Compares Lite-RAG vs standard RAG (full scan every time) across latency and stage resolution:

```bash
npm run benchmark
```

Output includes per-query latency, stage hit, and answer preview.

---

## Project Structure

```
src/
  db.ts                   Supabase client
  ingest/
    chunker.ts            Semantic chunking (300–600 tokens, optional overlap)
    embedder.ts           embedLite / embedFull / embedBoth
    pipeline.ts           ingestText — chunk → embed → insert
  retrieval/
    search.ts             liteSearch / refineSearch / deepSearch
    scorer.ts             confidence, recencyScore, metadataScore, decide
  context/
    assembler.ts          Deduplication + context formatting
  query/
    process.ts            Full pipeline: cache → S1 → decision → S2/S3 → generate
  llm/
    generate.ts           gpt-4.1-mini call
  index.ts                Express server

db/
  schema.sql              Table + indexes
  queries.sql             RPC functions (match_lite / match_refine / match_full)

config/
  settings.ts             All thresholds, dims, model names

benchmark/
  run.ts                  Lite vs Standard RAG comparison

seed.ts                   Insert sample documents
```

---

## Caching

In-memory, 10-minute TTL. **Automatically bypassed for time-sensitive queries** (queries containing: today, latest, current, pricing, now, recent, live).

---

## Known Limitations / TODOs

- Cache invalidation is TTL-only — no event-driven invalidation on ingest
- Lite embedding uses dimension truncation (MRL), not a dedicated small model
- Top-K is fixed per stage — adaptive Top-K not yet implemented
- No hybrid search (BM25 + vector) yet
