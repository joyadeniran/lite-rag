import { supabase } from "../db";
import { CONFIG } from "../../config/settings";
import type { ChunkResult } from "./scorer";

const { stage1TopK, stage2TopK, stage2ExpandCount, stage3TopK } = CONFIG.retrieval;

function assertRows(data: unknown, rpc: string): ChunkResult[] {
  if (!data) throw new Error(`${rpc} returned null`);
  return data as ChunkResult[];
}

export async function liteSearch(vec: number[], category?: string): Promise<ChunkResult[]> {
  const { data, error } = await supabase.rpc("match_lite_documents", {
    query_embedding: vec,
    match_count: stage1TopK,
    filter_category: category ?? null,
  });
  if (error) throw new Error(`liteSearch: ${error.message}`);
  return assertRows(data, "match_lite_documents");
}

export async function refineSearch(vec: number[], ids: string[]): Promise<ChunkResult[]> {
  const { data, error } = await supabase.rpc("match_refine_documents", {
    query_embedding: vec,
    candidate_ids: ids,
    expand_count: stage2ExpandCount,
  });
  if (error) throw new Error(`refineSearch: ${error.message}`);
  return assertRows(data, "match_refine_documents").slice(0, stage2TopK);
}

export async function deepSearch(vec: number[]): Promise<ChunkResult[]> {
  const { data, error } = await supabase.rpc("match_full_documents", {
    query_embedding: vec,
    match_count: stage3TopK,
  });
  if (error) throw new Error(`deepSearch: ${error.message}`);
  return assertRows(data, "match_full_documents");
}
