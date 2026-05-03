-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Documents table
-- embedding_full: 1536-dim (text-embedding-3-small default)
-- embedding_lite: 128-dim (via dimensions param, not slice)
CREATE TABLE IF NOT EXISTS documents (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content     TEXT NOT NULL,
  embedding_full VECTOR(1536),
  embedding_lite VECTOR(128),
  category    TEXT,
  source      TEXT,
  tags        TEXT[],
  created_at  TIMESTAMP DEFAULT NOW()
);

-- ANN indexes
CREATE INDEX IF NOT EXISTS idx_embedding_lite ON documents USING ivfflat (embedding_lite vector_cosine_ops) WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_embedding_full ON documents USING ivfflat (embedding_full vector_cosine_ops) WITH (lists = 100);

-- Metadata indexes
CREATE INDEX IF NOT EXISTS idx_category ON documents(category);
CREATE INDEX IF NOT EXISTS idx_source   ON documents(source);
CREATE INDEX IF NOT EXISTS idx_tags     ON documents USING GIN(tags);
