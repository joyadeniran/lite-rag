import "dotenv/config";
import { ingestText } from "./src/ingest/pipeline";

const DOCS = [
  {
    text: "Our pricing model is subscription-based with monthly and annual billing options. Annual plans include a 20% discount. Pricing tiers: Starter $29/mo, Growth $99/mo, Enterprise custom.",
    category: "pricing", source: "pricing-page",
  },
  {
    text: "Supplier verification requires three documents: business registration, tax certificate, and two trade references. Physical inspection is conducted for suppliers above $50k annual volume.",
    category: "suppliers", source: "ops-manual",
  },
  {
    text: "Onboarding takes 2–3 business days after document approval. New accounts receive a guided setup call and access to the help center.",
    category: "onboarding", source: "support-docs",
  },
  {
    text: "Payment terms are net-30 for verified suppliers. Early payment discounts of 2% are available for payment within 10 days.",
    category: "finance", source: "finance-policy",
  },
];

async function main() {
  for (const doc of DOCS) {
    const n = await ingestText(doc.text, { category: doc.category, source: doc.source });
    console.log(`Inserted ${n} chunk(s) from ${doc.source}`);
  }
  console.log("Seed complete.");
}

main().catch(console.error);
