import "dotenv/config";
import express from "express";
import { runQuery } from "./query/process";
import { ingestText } from "./ingest/pipeline";

const app = express();
app.use(express.json());

app.post("/query", async (req, res) => {
  const { query, category } = req.body;
  if (!query) return res.status(400).json({ error: "query required" });

  try {
    const result = await runQuery(query, category);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ingest", async (req, res) => {
  const { text, category, source, tags } = req.body;
  if (!text) return res.status(400).json({ error: "text required" });

  try {
    const count = await ingestText(text, { category, source, tags });
    res.json({ inserted: count });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`Lite-RAG running on :${PORT}`));
