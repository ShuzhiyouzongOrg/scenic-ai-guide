import assert from "node:assert/strict";
import { evaluateRegression } from "./check-rag-regression.mjs";

const datasetSha256 = "fixture-sha256";
const baselineDocument = {
  version: "test-v1",
  suites: {
    smoke: {
      dataset: {
        path: "data/tests/retrieval-cases.json",
        caseCount: 20,
        sha256: datasetSha256
      },
      metrics: {
        recallAt5: { baseline: 1, direction: "higher", maxAbsoluteRegression: 0.02 },
        mrr: { baseline: 0.975, direction: "higher", maxAbsoluteRegression: 0.03 },
        failureCount: { baseline: 0, direction: "lower", maxAbsoluteRegression: 0 },
        "retrievalLatencyMs.p95": {
          baseline: 100,
          direction: "lower",
          maxRelativeRegression: 0.5,
          maxValue: 250
        }
      }
    }
  }
};

const healthyReport = buildReport();
assert.equal(evaluateRegression({ baselineDocument, report: healthyReport, suite: "smoke" }).passed, true);

const qualityRegression = buildReport({ recallAt5: 0.97 });
const qualityResult = evaluateRegression({ baselineDocument, report: qualityRegression, suite: "smoke" });
assert.equal(qualityResult.passed, false);
assert.equal(qualityResult.violations[0].name, "recallAt5");

const latencyRegression = buildReport({ retrievalLatencyMs: { p95: 251 } });
const latencyResult = evaluateRegression({ baselineDocument, report: latencyRegression, suite: "smoke" });
assert.equal(latencyResult.passed, false);
assert.equal(latencyResult.violations[0].name, "retrievalLatencyMs.p95");

const truncatedDataset = buildReport({}, { caseCount: 19 });
const datasetResult = evaluateRegression({ baselineDocument, report: truncatedDataset, suite: "smoke" });
assert.equal(datasetResult.passed, false);
assert.equal(datasetResult.violations[0].name, "dataset.caseCount");

console.log("RAG regression gate tests passed");

function buildReport(metricOverrides = {}, datasetOverrides = {}) {
  return {
    suite: "smoke",
    dataset: {
      path: "data/tests/retrieval-cases.json",
      caseCount: 20,
      sha256: datasetSha256,
      ...datasetOverrides
    },
    metrics: {
      recallAt5: 1,
      mrr: 0.975,
      failureCount: 0,
      retrievalLatencyMs: { p95: 100 },
      ...metricOverrides
    }
  };
}
