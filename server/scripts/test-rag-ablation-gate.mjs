import assert from "node:assert/strict";
import { evaluateAblation } from "./check-rag-ablation.mjs";

const report = (metrics) => ({ metrics });
const healthy = evaluateAblation({
  rule: report({ recallAt5: 0.94, mrr: 0.9 }),
  bm25: report({ recallAt5: 0.96, mrr: 0.91 }),
  fusion: report({ recallAt5: 0.98, mrr: 0.93 }),
  rerankBefore: report({ ndcgAt5: 0.9, top1CitationHitRate: 0.88, retrievalLatencyMs: { p95: 120 } }),
  rerankAfter: report({ ndcgAt5: 0.94, top1CitationHitRate: 0.91, retrievalLatencyMs: { p95: 800 } }),
  maxRerankP95Ms: 1200
});
assert.equal(healthy.passed, true);

const fusionRegression = evaluateAblation({
  rule: report({ recallAt5: 1, mrr: 0.95 }),
  bm25: report({ recallAt5: 0.9, mrr: 0.9 }),
  fusion: report({ recallAt5: 0.99, mrr: 0.96 })
});
assert.equal(fusionRegression.passed, false);
assert.equal(fusionRegression.violations[0].name, "recallAt5");

const rerankLatency = evaluateAblation({
  rule: report({ recallAt5: 1, mrr: 1 }),
  bm25: report({ recallAt5: 1, mrr: 1 }),
  fusion: report({ recallAt5: 1, mrr: 1 }),
  rerankBefore: report({ ndcgAt5: 0.9, top1CitationHitRate: 0.9 }),
  rerankAfter: report({ ndcgAt5: 0.91, top1CitationHitRate: 0.91, retrievalLatencyMs: { p95: 1201 } }),
  maxRerankP95Ms: 1200
});
assert.equal(rerankLatency.passed, false);
assert.equal(rerankLatency.violations[0].name, "rerank.retrievalLatencyMs.p95");

console.log("RAG ablation gate tests passed");
