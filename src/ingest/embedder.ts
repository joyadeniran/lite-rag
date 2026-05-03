import OpenAI from "openai";
import { CONFIG } from "../../config/settings";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Two separate API calls with correct dimensions — no slicing
export async function embedLite(text: string): Promise<number[]> {
  const res = await client.embeddings.create({
    model: CONFIG.embedding.model,
    input: text,
    dimensions: CONFIG.embedding.dimsLite,
  });
  return res.data[0].embedding;
}

export async function embedFull(text: string): Promise<number[]> {
  const res = await client.embeddings.create({
    model: CONFIG.embedding.model,
    input: text,
    dimensions: CONFIG.embedding.dimsFull,
  });
  return res.data[0].embedding;
}

// Ingest-time: generate both in parallel
export async function embedBoth(text: string): Promise<{ lite: number[]; full: number[] }> {
  const [lite, full] = await Promise.all([embedLite(text), embedFull(text)]);
  return { lite, full };
}
