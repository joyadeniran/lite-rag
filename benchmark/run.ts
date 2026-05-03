import "dotenv/config";
import { performance } from "perf_hooks";
import { runQuery } from "../src/query/process";
import { embedFull } from "../src/ingest/embedder";
import { deepSearch } from "../src/retrieval/search";
import { generate } from "../src/llm/generate";
import { assembleContext } from "../src/context/assembler";

const QUERIES = [
  "What is our pricing model?",
  "How does onboarding work?",
  "Latest inventory policy update",
  "Explain supplier verification process",
  "What are the current payment terms?",
];

async function runStandardRAG(query: string): Promise<string> {
  const vec = await embedFull(query);
  const results = await deepSearch(vec);
  return generate(query, assembleContext(results));
}

async function main() {
  let stage1Wins = 0, stage2Wins = 0, stage3Wins = 0;

  console.log("\n=== Lite-RAG Benchmark ===\n");

  for (const q of QUERIES) {
    console.log(`Query: "${q}"`);

    const t1 = performance.now();
    const lite = await runQuery(q);
    const liteMs = (performance.now() - t1).toFixed(0);

    const t2 = performance.now();
    const std = await runStandardRAG(q);
    const stdMs = (performance.now() - t2).toFixed(0);

    if (lite.stage === 1) stage1Wins++;
    else if (lite.stage === 2) stage2Wins++;
    else stage3Wins++;

    console.log(`  Lite: ${liteMs}ms (Stage ${lite.stage}${lite.cached ? ", cached" : ""})`);
    console.log(`  Std:  ${stdMs}ms`);
    console.log(`  Lite answer: ${lite.answer.slice(0, 100)}`);
    console.log(`  Std  answer: ${std.slice(0, 100)}\n`);
  }

  const total = QUERIES.length;
  console.log("=== Summary ===");
  console.log(`Stage 1 resolved: ${stage1Wins}/${total} (${((stage1Wins / total) * 100).toFixed(0)}%)`);
  console.log(`Stage 2: ${stage2Wins}/${total} | Stage 3: ${stage3Wins}/${total}`);
}

main().catch(console.error);
