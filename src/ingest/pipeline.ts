import { supabase } from "../db";
import { chunkText } from "./chunker";
import { embedBoth } from "./embedder";

export interface IngestOptions {
  category?: string;
  source?: string;
  tags?: string[];
}

export async function ingestText(text: string, opts: IngestOptions = {}): Promise<number> {
  const chunks = chunkText(text);
  let inserted = 0;

  for (const chunk of chunks) {
    const { lite, full } = await embedBoth(chunk.content);

    const { error } = await supabase.from("documents").insert({
      content: chunk.content,
      embedding_lite: lite,
      embedding_full: full,
      category: opts.category ?? null,
      source: opts.source ?? null,
      tags: opts.tags ?? [],
    });

    if (error) throw new Error(`Ingest failed on chunk ${chunk.index}: ${error.message}`);
    inserted++;
  }

  return inserted;
}
