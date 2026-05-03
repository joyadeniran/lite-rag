import { CONFIG } from "../../config/settings";
import type { ChunkResult } from "../retrieval/scorer";

const { maxContextChunks } = CONFIG.retrieval;

export function assembleContext(chunks: ChunkResult[]): ChunkResult[] {
  const seen = new Set<string>();
  const unique: ChunkResult[] = [];

  for (const chunk of chunks) {
    if (seen.has(chunk.id)) continue;
    seen.add(chunk.id);
    unique.push(chunk);
    if (unique.length >= maxContextChunks) break;
  }

  // Sort by similarity descending for prompt ordering
  return unique.sort((a, b) => b.similarity - a.similarity);
}

export function formatContext(chunks: ChunkResult[]): string {
  return chunks.map((c, i) => `[${i + 1}] ${c.content}`).join("\n\n");
}
