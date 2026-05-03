// Semantic chunker: splits on sentence boundaries, targets 300–600 tokens.
// Approximation: 1 token ≈ 4 chars.

const CHAR_MIN = 300 * 4;
const CHAR_MAX = 600 * 4;
const OVERLAP_RATIO = 0.15;

export interface Chunk {
  content: string;
  index: number;
}

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.?!])\s+/)
    .filter((s) => s.trim().length > 0);
}

export function chunkText(text: string, overlap = true): Chunk[] {
  const sentences = splitSentences(text);
  const chunks: Chunk[] = [];
  let buffer = "";
  let chunkIndex = 0;
  let overlapBuffer = "";

  for (const sentence of sentences) {
    buffer += (buffer ? " " : "") + sentence;

    if (buffer.length >= CHAR_MAX) {
      chunks.push({ content: buffer.trim(), index: chunkIndex++ });
      overlapBuffer = overlap
        ? buffer.slice(-Math.floor(buffer.length * OVERLAP_RATIO))
        : "";
      buffer = overlapBuffer;
    }
  }

  if (buffer.length >= CHAR_MIN) {
    chunks.push({ content: buffer.trim(), index: chunkIndex++ });
  } else if (chunks.length > 0 && buffer.trim().length > 0) {
    // Append remainder to last chunk rather than creating an undersized one
    chunks[chunks.length - 1].content += " " + buffer.trim();
  }

  return chunks;
}
