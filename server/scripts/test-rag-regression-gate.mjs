/**
 * @fileoverview RAG 回归门禁单元测试脚本。
 * @description 验证基线一致、数据集漂移、质量下降和门禁例外条件。
 */
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

/**
 * @description 构造可按需覆盖指标和数据集字段的回归报告夹具。
 * @param {object} [metricOverrides={}] 指标覆盖值。
 * @param {object} [datasetOverrides={}] 数据集元数据覆盖值。
 * @returns {object} 回归评测报告夹具。
 */
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
