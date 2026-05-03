-- Stage 1: lite vector search with optional category filter
CREATE OR REPLACE FUNCTION match_lite_documents(
  query_embedding vector(128),
  match_count     int,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (id uuid, content text, similarity float, category text, source text, created_at timestamp)
LANGUAGE sql STABLE AS $$
  SELECT
    id, content,
    1 - (embedding_lite <=> query_embedding) AS similarity,
    category, source, created_at
  FROM documents
  WHERE filter_category IS NULL OR category = filter_category
  ORDER BY embedding_lite <=> query_embedding
  LIMIT match_count;
$$;

-- Stage 2: re-rank + expand (S1 IDs + top-2 full scan, deduped)
CREATE OR REPLACE FUNCTION match_refine_documents(
  query_embedding vector(1536),
  candidate_ids   uuid[],
  expand_count    int DEFAULT 2
)
RETURNS TABLE (id uuid, content text, similarity float, category text, source text, created_at timestamp)
LANGUAGE sql STABLE AS $$
  SELECT DISTINCT ON (id)
    id, content,
    1 - (embedding_full <=> query_embedding) AS similarity,
    category, source, created_at
  FROM documents
  WHERE id = ANY(candidate_ids)
     OR id IN (
       SELECT id FROM documents
       ORDER BY embedding_full <=> query_embedding
       LIMIT expand_count
     )
  ORDER BY id, embedding_full <=> query_embedding
  LIMIT 4;
$$;

-- Stage 3: full dataset scan
CREATE OR REPLACE FUNCTION match_full_documents(
  query_embedding vector(1536),
  match_count     int
)
RETURNS TABLE (id uuid, content text, similarity float, category text, source text, created_at timestamp)
LANGUAGE sql STABLE AS $$
  SELECT
    id, content,
    1 - (embedding_full <=> query_embedding) AS similarity,
    category, source, created_at
  FROM documents
  ORDER BY embedding_full <=> query_embedding
  LIMIT match_count;
$$;
