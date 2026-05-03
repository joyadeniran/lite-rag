import OpenAI from "openai";
import { CONFIG } from "../../config/settings";
import { formatContext } from "../context/assembler";
import type { ChunkResult } from "../retrieval/scorer";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function generate(query: string, chunks: ChunkResult[]): Promise<string> {
  if (!chunks.length) return "I don't have enough information to answer that.";

  const context = formatContext(chunks);

  const res = await client.chat.completions.create({
    model: CONFIG.llm.model,
    messages: [
      { role: "system", content: "Answer using only the provided context. Be concise." },
      { role: "user", content: `Context:\n${context}\n\nQuestion: ${query}` },
    ],
  });

  return res.choices[0].message.content ?? "No response generated.";
}
