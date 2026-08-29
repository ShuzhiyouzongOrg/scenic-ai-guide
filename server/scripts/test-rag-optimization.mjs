/**
 * @fileoverview RAG 优化功能综合测试脚本。
 * @description 覆盖 PDF/XLSX 解析、分块、元数据、混合检索、缓存、上传和知识版本切换。
 */
import assert from "node:assert";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import XLSX from "xlsx";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-rag-test-"));
process.env.DATA_DIR = tempDir;
process.env.UPLOAD_DIR = join(tempDir, "uploads");
process.env.SQLITE_PATH = ":memory:";
process.env.DOCUMENT_PARSER_ENABLED = "false";

try {
  const {
    createUpload,
    listUploadCitations,
    listUploads,
    reprocessUpload,
    setUploadEnabled
  } = await import("../src/services/uploads.mjs");
  const {
    estimateTextTokens,
    getActiveKnowledgeVersion,
    loadKnowledge,
    splitLongText
  } = await import("../src/services/knowledgeBuild.mjs");
  const { buildQueryPlan } = await import("../src/services/retrieval/query.mjs");
  const {
    loadKnowledgeFromSqlite,
    verifyKnowledgeStoreConsistency
  } = await import("../src/services/knowledgeRepository.mjs");
  const { withKnowledgeWriteLock } = await import("../src/services/knowledgeWriteLock.mjs");
  const {
    applyFreshnessPreference,
    clearRetrievalCache,
    detectConflictingFacts,
    getRetrievalCacheStats,
    hybridSearch
  } = await import("../src/services/retrieval.mjs");
  const { config } = await import("../src/config.mjs");
  const { clearFaqCache, faqCacheStats, getCachedAnswer, setCachedAnswer } = await import("../src/services/faqCache.mjs");
  const { deduplicateCandidates, maximalMarginalRelevance, reciprocalRankFusion } = await import("../src/services/retrieval/fusion.mjs");
  const {
    buildContextBlock,
    CONTEXT_DOCUMENT_TOKEN_BUDGET,
    CONTEXT_TOKEN_BUDGET,
    packContextResults
  } = await import("../src/services/prompts.mjs");
  const { listRetrievalTraces } = await import("../src/services/retrievalTrace.mjs");
  const { validateKnowledgeSnapshotMetadata } = await import("../src/services/knowledgeSchema.mjs");
  const { backfillLegacyKnowledgeScopes, getDb, migrate } = await import("../src/db/database.mjs");
  const db = getDb();
  migrate(db);
  migrate(db);

  const queryPlan = buildQueryPlan("请问灵山大佛多高？不要猜测88米");
  assert.ok(queryPlan.variants.length <= 3);
  assert.ok(queryPlan.variants.some((variant) => variant.includes("高度")));
  assert.ok(queryPlan.features.negations.length > 0);
  assert.ok(queryPlan.features.numbers.includes("88米"));
  const complexPlan = buildQueryPlan("灵山胜境演出时间，并且推荐亲子路线");
  assert.equal(complexPlan.subQueries.length, 2);
  assert.ok(complexPlan.subQueries.every((query) => query.includes("灵山胜境")));
  assert.equal(buildQueryPlan("灵山大佛多高").subQueries.length, 0, "simple queries must not fan out");

  const longChineseText = Array.from({ length: 80 }, (_, index) =>
    `第${index + 1}段介绍灵山胜境的游览信息，包括开放时间、景点路线和服务安排。`
  ).join("\n");
  const chunkedText = splitLongText(longChineseText, { maxTokens: 600, overlapTokens: 64 });
  assert.ok(chunkedText.length >= 2, "long text must produce multiple chunks");
  assert.ok(chunkedText.every((chunk) => estimateTextTokens(chunk) <= 600), "chunks must respect token budget");
  assert.ok(
    chunkedText.slice(1).some((chunk, index) => {
      const previous = chunkedText[index];
      const tail = previous.slice(-32).trim();
      return tail.length > 0 && chunk.includes(tail);
    }),
    "adjacent chunks should preserve a sentence-boundary overlap"
  );

  const multilingualText = `${"A multilingual guide sentence with stable Unicode boundaries. ".repeat(50)}
日本語の案内文です。한국어 안내 문장입니다。😀`;
  const multilingualChunks = splitLongText(multilingualText, { maxTokens: 120, overlapTokens: 16 });
  assert.ok(multilingualChunks.every((chunk) => estimateTextTokens(chunk) <= 120));
  assert.equal(multilingualChunks.join("").includes("\ud800"), false, "chunking must not emit lone high surrogates");
  assert.equal(multilingualChunks.join("").includes("\udfff"), false, "chunking must not emit lone low surrogates");

  db.prepare(
    `INSERT INTO knowledge_documents
      (id, file_name, stored_name, mime_type, size, file_type, status,
       processing_stage, knowledge_scope, chunk_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'uploaded', 'uploaded', 'visitor_qa', 0, ?)`
  ).run(
    "legacy-analytics",
    "景点景区旅游数据行为分析数据.xlsx",
    "legacy-analytics.xlsx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    1,
    "xlsx",
    new Date().toISOString()
  );
  assert.equal(backfillLegacyKnowledgeScopes(db), 1);
  assert.equal(
    db.prepare("SELECT knowledge_scope FROM knowledge_documents WHERE id = ?").get("legacy-analytics").knowledge_scope,
    "operations_analytics"
  );
  assert.equal(backfillLegacyKnowledgeScopes(db), 0, "legacy scope backfill must be idempotent");
  db.prepare("DELETE FROM knowledge_documents WHERE id = ?").run("legacy-analytics");

  const xlsxUpload = createUpload({
    fileName: "visitor-facts.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    contentBase64: workbook(["景点", "开放时间"], ["灵山大佛", "08:30-17:00"]).toString("base64")
  });
  assert.equal(xlsxUpload.status, "processed");
  assert.equal(xlsxUpload.knowledgeScope, "visitor_qa");
  assert.equal(xlsxUpload.documentType, "xlsx");
  assert.equal(xlsxUpload.chunkCount, 1);
  const xlsxHit = hybridSearch("灵山大佛开放时间", { documentType: "xlsx", limit: 1 }).results[0];
  assert.equal(xlsxHit.sheetName, "景点");
  assert.equal(xlsxHit.rowStart, 2);
  assert.match(xlsxHit.range, /A2:B2/);

  const restrictedUpload = createUpload({
    fileName: "restricted-tenant.md",
    mimeType: "text/markdown",
    knowledgeScope: "visitor_qa",
    accessScope: "admin",
    tenantId: "tenant-a",
    contentBase64: Buffer.from("# Restricted\nprivate-tenant-fact 仅供管理端验证。", "utf8").toString("base64")
  });
  assert.equal(restrictedUpload.accessScope, "admin");
  assert.equal(restrictedUpload.tenantId, "tenant-a");
  assert.equal(hybridSearch("private-tenant-fact", { limit: 5 }).results.length, 0);
  assert.equal(hybridSearch("private-tenant-fact", {
    limit: 5,
    accessScopes: ["admin"],
    tenantId: "tenant-b"
  }).results.length, 0);
  assert.ok(hybridSearch("private-tenant-fact", {
    limit: 5,
    accessScopes: ["admin"],
    tenantId: "tenant-a"
  }).results.some((item) => item.documentId === restrictedUpload.id));

  clearRetrievalCache();
  hybridSearch("灵山大佛多高", { limit: 5 });
  const publicCache = getRetrievalCacheStats();
  assert.equal(publicCache.size, 1);
  assert.equal(publicCache.keys.some((key) => key.includes("灵山大佛")), false, "cache keys must not retain raw questions");
  hybridSearch("我的手机号是13800138000，灵山大佛多高", { limit: 5 });
  assert.equal(getRetrievalCacheStats().size, 1, "queries containing personal data must bypass retrieval cache");

  assert.throws(
    () => createUpload({
      fileName: "unsafe-macro.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      contentBase64: appendZipDirectoryEntry(
        workbook(["景点"], ["测试"]),
        "xl/vbaProject.bin"
      ).toString("base64")
    }),
    (error) => error.code === "XLSX_MACRO_REJECTED"
  );
  assert.throws(
    () => createUpload({
      fileName: "zip-bomb.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      contentBase64: appendZipPressureEntry(
        workbook(["景点"], ["测试"]),
        "xl/sharedStrings.xml",
        1,
        200 * 1024 * 1024
      ).toString("base64")
    }),
    (error) => error.code === "XLSX_EXPANDED_SIZE_LIMIT"
  );

  const analytics = createUpload({
    fileName: "景点景区旅游数据行为分析数据.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    contentBase64: workbook(["游客ID", "消费金额"], ["T-001", "210"]).toString("base64")
  });
  assert.equal(analytics.status, "skipped");
  assert.equal(analytics.knowledgeScope, "operations_analytics");
  assert.equal(hybridSearch("T-001 消费金额", { limit: 5 }).results.some((item) => item.source === analytics.fileName), false);

  const disabled = createUpload({
    fileName: "disabled.md",
    mimeType: "text/markdown",
    enabled: false,
    contentBase64: Buffer.from("# Disabled\nThis should not be searchable.").toString("base64")
  });
  assert.equal(disabled.status, "skipped");
  assert.equal(disabled.enabled, false);

  const reprocessable = createUpload({
    fileName: "reprocessable.md",
    mimeType: "text/markdown",
    contentBase64: Buffer.from("# Reprocess\nThis document can be processed again.").toString("base64")
  });
  const versionBeforeReprocess = getActiveKnowledgeVersion();
  const reprocessed = reprocessUpload(reprocessable.id);
  assert.equal(reprocessed.status, "processed");
  assert.equal(getActiveKnowledgeVersion(), versionBeforeReprocess, "unchanged document should reuse the active index");
  assert.ok(listUploadCitations(reprocessable.id).citations.length > 0, "processed document should expose citation entries");
  const disabledReprocessable = setUploadEnabled(reprocessable.id, false);
  assert.equal(disabledReprocessable.enabled, false);
  assert.equal(
    hybridSearch("document can be processed again", { limit: 10 }).results.some(
      (item) => item.source === reprocessable.fileName
    ),
    false,
    "disabled documents must leave the active retrieval snapshot"
  );
  assert.equal(listUploadCitations(reprocessable.id).citations.length, 0);
  const enabledReprocessable = setUploadEnabled(reprocessable.id, true);
  assert.equal(enabledReprocessable.enabled, true);
  assert.equal(enabledReprocessable.status, "processed");
  assert.ok(
    hybridSearch("document can be processed again", { limit: 10 }).results.some(
      (item) => item.source === reprocessable.fileName
    ),
    "re-enabled documents must return to retrieval"
  );
  assert.ok(listUploadCitations(reprocessable.id).citations.every((item) => item.citationId.startsWith("C-")));

  const pdfUpload = createUpload({
    fileName: "visitor-guide.pdf",
    mimeType: "application/pdf",
    contentBase64: textPdf("灵山大佛通高88米，位于祥符禅寺附近，是重要景点。").toString("base64")
  });
  assert.equal(pdfUpload.status, "processed");
  assert.equal(hybridSearch("重要景点 附近", { documentType: "pdf", limit: 1 }).results[0]?.page, 1);

  assert.throws(
    () => createUpload({
      fileName: "bad.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      contentBase64: Buffer.from("not-xlsx").toString("base64")
    }),
    (error) => error.code === "UPLOAD_SIGNATURE_INVALID"
  );
  const versionBeforeFailedPdf = getActiveKnowledgeVersion();
  assert.throws(
    () => createUpload({
      fileName: "scan.pdf",
      mimeType: "application/pdf",
      contentBase64: Buffer.from("%PDF-1.4\\n1 0 obj << /Type /Page >> endobj\\n%%EOF", "ascii").toString("base64")
    }),
    (error) => error.code === "PDF_NEEDS_OCR"
  );
  assert.equal(listUploads().find((item) => item.fileName === "scan.pdf")?.status, "needs_ocr");
  assert.equal(getActiveKnowledgeVersion(), versionBeforeFailedPdf, "failed OCR routing must preserve the active index");
  const scanRecord = listUploads().find((item) => item.fileName === "scan.pdf");
  assert.throws(
    () => reprocessUpload(scanRecord.id),
    (error) => error.code === "PDF_NEEDS_OCR"
  );
  assert.equal(listUploads().find((item) => item.id === scanRecord.id)?.status, "needs_ocr");

  const versionBeforeDatabaseFailure = getActiveKnowledgeVersion();
  db.exec(`CREATE TEMP TRIGGER fail_knowledge_chunk_sync
    BEFORE INSERT ON knowledge_chunks
    BEGIN
      SELECT RAISE(ABORT, 'injected knowledge chunk failure');
    END`);
  try {
    assert.throws(
      () => createUpload({
        fileName: "rollback-failure.md",
        mimeType: "text/markdown",
        contentBase64: Buffer.from("# Rollback\nrollback-poison-token must never be searchable").toString("base64")
      }),
      /injected knowledge chunk failure/u
    );
  } finally {
    db.exec("DROP TRIGGER fail_knowledge_chunk_sync");
  }
  assert.equal(getActiveKnowledgeVersion(), versionBeforeDatabaseFailure, "database failure must restore the previous active snapshot");
  assert.equal(
    hybridSearch("rollback-poison-token", { limit: 10 }).results.some((item) => item.source === "rollback-failure.md"),
    false,
    "failed documents must not remain searchable"
  );

  const versionBeforeCache = getActiveKnowledgeVersion();
  setCachedAnswer("版本测试问题", "qa", { answer: "v1" });
  assert.equal(getCachedAnswer("版本测试问题", "qa")?.answer, "v1");
  createUpload({
    fileName: "version-bump.md",
    mimeType: "text/markdown",
    contentBase64: Buffer.from("# Version bump\nThis changes the active snapshot.").toString("base64")
  });
  assert.notEqual(getActiveKnowledgeVersion(), versionBeforeCache);
  assert.equal(getCachedAnswer("版本测试问题", "qa"), null);
  setCachedAnswer("并发版本问题", "qa", { answer: "version-a" }, undefined, "version-a");
  assert.equal(getCachedAnswer("并发版本问题", "qa", "version-a")?.answer, "version-a");
  assert.equal(getCachedAnswer("并发版本问题", "qa", "version-b"), null);
  clearFaqCache();
  const zhCacheScope = {
    locale: "zh",
    scenicArea: "lingshan",
    retrievalMode: "control",
    accessScopes: ["public"],
    tenantId: "default"
  };
  setCachedAnswer("同一个问题", "qa", { answer: "zh-control" }, undefined, "version-a", zhCacheScope);
  assert.equal(getCachedAnswer("同一个问题", "qa", "version-a", zhCacheScope)?.answer, "zh-control");
  assert.equal(getCachedAnswer("同一个问题", "qa", "version-a", { ...zhCacheScope, locale: "en" }), null);
  assert.equal(getCachedAnswer("同一个问题", "qa", "version-a", { ...zhCacheScope, scenicArea: "nianhuawan" }), null);
  assert.equal(getCachedAnswer("同一个问题", "qa", "version-a", { ...zhCacheScope, retrievalMode: "treatment" }), null);
  assert.equal(getCachedAnswer("同一个问题", "qa", "version-a", { ...zhCacheScope, accessScopes: ["admin"] }), null);
  assert.equal(setCachedAnswer("手机号13800138000", "qa", { answer: "private" }), false);
  assert.equal(faqCacheStats().entries.some((entry) => entry.key.includes("同一个问题")), false);
  const coveredDecision = hybridSearch("灵山大佛多高", { limit: 5 }).decision;
  assert.equal(coveredDecision.reason, "candidate_found");
  assert.ok(coveredDecision.thresholds.minQueryCoverage >= 0);
  const uncoveredDecision = hybridSearch("zzq_uncovered_9f8a7c6e", { limit: 5 }).decision;
  assert.equal(uncoveredDecision.answerable, false);
  assert.equal(uncoveredDecision.reason, "no_candidate");
  const originalThresholdProfiles = config.rag.thresholdProfiles;
  try {
    config.rag.thresholdProfiles = {
      zh: {
        open_time: {
          minRuleScore: 987,
          minBm25Score: 987,
          minQueryCoverage: 0.99
        }
      }
    };
    clearRetrievalCache();
    const profiledDecision = hybridSearch("灵山胜境开放时间", {
      locale: "zh",
      limit: 5
    }).decision;
    assert.equal(profiledDecision.thresholds.profile, "zh:open_time");
    assert.equal(profiledDecision.thresholds.minRuleScore, 987);
    assert.equal(profiledDecision.thresholds.minBm25Score, 987);
    assert.equal(profiledDecision.thresholds.minQueryCoverage, 0.99);
    assert.equal(profiledDecision.answerable, false);
  } finally {
    config.rag.thresholdProfiles = originalThresholdProfiles;
    clearRetrievalCache();
  }
  const traces = listRetrievalTraces({ limit: 20 });
  assert.ok(traces.some((trace) => trace.queryHash && trace.candidates.every((candidate) => !candidate.content)));

  const parentSource = Array.from({ length: 90 }, (_, index) =>
    `第${index + 1}段用于验证父片段回取，内容包含路线、开放时间和景点服务说明。`
  ).join("\n") + "\nparent-child-unique-fact 位于父片段末尾。";
  createUpload({
    fileName: "parent-child.md",
    mimeType: "text/markdown",
    contentBase64: Buffer.from(`# Parent Child\n${parentSource}`).toString("base64")
  });

  const knowledge = loadKnowledge();
  const pointerPath = join(tempDir, "generated", "active-index.json");
  assert.ok(existsSync(pointerPath));
  const pointer = JSON.parse(readFileSync(pointerPath, "utf8"));
  assert.equal(pointer.indexVersion, knowledge.indexVersion);
  assert.ok(existsSync(join(tempDir, "generated", "snapshots", pointer.indexVersion, "knowledge.json")));
  assert.equal(existsSync(join(tempDir, "generated", ".knowledge-write.lock")), false);
  const parentHit = hybridSearch("parent-child-unique-fact", { limit: 5 }).results.find(
    (item) => (item.parentChunkIds || []).length > 1
  );
  assert.ok(parentHit, "parent-child retrieval should find a parent with multiple children");
  assert.ok(parentHit.contextContent.length > parentHit.content.length);
  assert.ok(parentHit.contextContent.includes(parentHit.content.slice(0, 24)));
  assert.match(buildContextBlock([parentHit]), new RegExp(parentHit.contextContent.slice(0, 24)));
  const packed = packContextResults([parentHit, parentHit, parentHit], { maxTokens: 500, perItemTokens: 220 });
  assert.ok(packed.length > 0);
  assert.ok(packed.reduce((sum, item) => sum + item.tokens, 0) <= 500);
  assert.ok(CONTEXT_TOKEN_BUDGET >= 3000);
  const multiSourcePacked = packContextResults([
    { ...parentHit, id: "pack-a1", documentId: "doc-a", source: "a.md", score: 10, contextContent: "甲。".repeat(700) },
    { ...parentHit, id: "pack-a2", documentId: "doc-a", source: "a.md", score: 9, contextContent: "乙。".repeat(700) },
    { ...parentHit, id: "pack-b1", documentId: "doc-b", source: "b.md", score: 8, contextContent: "丙。".repeat(300) }
  ], { maxTokens: 1200, perItemTokens: 700, perDocumentTokens: 750 });
  assert.ok(multiSourcePacked.some((item) => item.item.documentId === "doc-b"), "context packing must retain another source");
  assert.ok(multiSourcePacked
    .filter((item) => item.item.documentId === "doc-a")
    .reduce((sum, item) => sum + item.tokens, 0) <= 750);
  assert.ok(CONTEXT_DOCUMENT_TOKEN_BUDGET < CONTEXT_TOKEN_BUDGET);
  const conflicts = detectConflictingFacts([
    { id: "a", content: "开放时间为10:00", citation: { citationId: "C-a" } },
    { id: "b", content: "开放时间为11:00", citation: { citationId: "C-b" } }
  ], [{ intent: "open_time" }]);
  assert.deepEqual(conflicts[0]?.values, ["10:00", "11:00"]);
  const unrelatedVenueHours = detectConflictingFacts([
    {
      id: "museum",
      scenicSpotId: "LS-012",
      scenicArea: "灵山胜境",
      content: "佛教文化博览馆开放时间为8:00-17:00。",
      citation: { citationId: "C-museum" }
    },
    {
      id: "palace",
      scenicSpotId: "LS-013",
      scenicArea: "灵山胜境",
      content: "灵山梵宫开放时间为9:00-17:00。",
      citation: { citationId: "C-palace" }
    }
  ], [{ intent: "open_time" }]);
  assert.equal(unrelatedVenueHours.length, 0, "different venue schedules must not be treated as a conflict");
  const unrelatedPerformanceTimes = detectConflictingFacts([
    {
      id: "bath-show",
      scenicSpotId: "LS-006",
      content: "九龙灌浴演出时间为10:00、11:30。",
      citation: { citationId: "C-bath" }
    },
    {
      id: "palace-show",
      scenicSpotId: "LS-013",
      content: "《灵山吉祥颂》演出时间为10:35、14:00。",
      citation: { citationId: "C-palace-show" }
    }
  ], [{ intent: "performance_time" }]);
  assert.equal(unrelatedPerformanceTimes.length, 0, "different performances must not be treated as a conflict");
  const ticketCategories = detectConflictingFacts([
    {
      id: "ticket-a",
      scenicArea: "灵山胜境",
      content: "成人票210元，半价票105元。",
      citation: { citationId: "C-ticket-a" }
    },
    {
      id: "ticket-b",
      scenicArea: "灵山胜境",
      content: "成人票210元，半价票105元。",
      citation: { citationId: "C-ticket-b" }
    }
  ], [{ intent: "ticket" }]);
  assert.equal(ticketCategories.length, 0, "different ticket categories must not be treated as a price conflict");
  const closureConflict = detectConflictingFacts([
    { id: "open", content: "景区正常开放", citation: { citationId: "C-open" } },
    { id: "closed", content: "景区因天气临时闭园", citation: { citationId: "C-closed" } }
  ], []);
  assert.deepEqual(closureConflict.find((item) => item.field === "opening_status")?.values, ["正常开放", "临时闭园"]);
  const freshness = applyFreshnessPreference([
    { chunk: { id: "old", validFrom: "2025-01-01" }, score: 1, reasons: [] },
    { chunk: { id: "new", validFrom: "2026-08-01" }, score: 1, reasons: [] }
  ], [{ intent: "ticket" }]);
  assert.equal(freshness[0].chunk.id, "new", "latest valid time-sensitive evidence should win a relevance tie");
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM knowledge_index_versions WHERE active = 1").get().n,
    1
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM knowledge_chunks WHERE index_version = ?").get(pointer.indexVersion).n,
    knowledge.chunks.length
  );
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM knowledge_documents WHERE index_version = ?").get(pointer.indexVersion).n,
    knowledge.documents.length,
    "SQLite document metadata must match the active snapshot"
  );
  assert.equal(verifyKnowledgeStoreConsistency().ok, true);
  const metadataValidation = validateKnowledgeSnapshotMetadata(loadKnowledgeFromSqlite());
  assert.equal(metadataValidation.ok, true, metadataValidation.errors.join("\n"));
  assert.ok(metadataValidation.checked > 0);

  const duplicateCandidates = [
    { chunk: { id: "a", parentId: "p1", title: "A", content: "same content" }, score: 0.9, channel: "rule" },
    { chunk: { id: "b", parentId: "p1", title: "B", content: "same content" }, score: 0.8, channel: "bm25" },
    { chunk: { id: "c", parentId: "p2", title: "C", content: "different evidence" }, score: 0.7, channel: "bm25" }
  ];
  const fused = reciprocalRankFusion([duplicateCandidates], { limit: 3 });
  assert.equal(fused.length, 3);
  const weightedFusion = reciprocalRankFusion([
    [{ chunk: { id: "rank-a" }, score: 1, channel: "rule" }, { chunk: { id: "rank-b" }, score: 0.9, channel: "rule" }],
    [{ chunk: { id: "rank-b" }, score: 1, channel: "bm25" }, { chunk: { id: "rank-a" }, score: 0.9, channel: "bm25" }]
  ], { limit: 2, weights: [0.25, 1.75] });
  assert.equal(weightedFusion[0].chunk.id, "rank-b");
  assert.equal(weightedFusion[0].channels.find((item) => item.channel === "bm25")?.weight, 1.75);
  assert.equal(maximalMarginalRelevance(fused, { limit: 2, maxPerParent: 1 }).length, 2);
  const hardDuplicates = deduplicateCandidates([
    { chunk: { id: "a", documentId: "doc-a", parentId: "p1", contentHash: "same", content: "重复正文" }, score: 3 },
    { chunk: { id: "b", documentId: "doc-b", parentId: "p2", contentHash: "same", content: "重复正文" }, score: 2 },
    { chunk: { id: "c", documentId: "doc-c", parentId: "p3", contentHash: "unique", content: "独立证据" }, score: 1 }
  ]);
  assert.deepEqual(hardDuplicates.map((item) => item.chunk.id), ["a", "c"]);
  const sourceDiverse = maximalMarginalRelevance([
    { chunk: { id: "a1", documentId: "doc-a", parentId: "p1", content: "高相关证据一" }, score: 10 },
    { chunk: { id: "a2", documentId: "doc-a", parentId: "p2", content: "高相关证据二" }, score: 9 },
    { chunk: { id: "b1", documentId: "doc-b", parentId: "p3", content: "另一来源证据" }, score: 5 }
  ], { limit: 2 });
  assert.equal(new Set(sourceDiverse.map((item) => item.chunk.documentId)).size, 2);

  rmSync(join(tempDir, "generated"), { recursive: true, force: true });
  const recoveredKnowledge = loadKnowledgeFromSqlite();
  assert.ok(recoveredKnowledge?.chunks.length > 0, "SQLite must recover the active chunks after JSON cache deletion");
  assert.ok(
    hybridSearch("灵山大佛多高", { limit: 5 }).results.length > 0,
    "retrieval must remain available after deleting the runtime JSON cache"
  );

  const lockDir = join(tempDir, "lock-test");
  let lockCallbackRan = false;
  withKnowledgeWriteLock(lockDir, () => {
    lockCallbackRan = true;
    assert.throws(
      () => withKnowledgeWriteLock(lockDir, () => true, { waitMs: 5, retryMs: 1 }),
      (error) => error.code === "KNOWLEDGE_WRITE_LOCK_TIMEOUT"
    );
  });
  assert.equal(lockCallbackRan, true);
  assert.equal(existsSync(join(lockDir, ".knowledge-write.lock")), false);

  console.log("PASS  RAG scope, XLSX/PDF extraction, OCR routing, version cache, atomic snapshot, BM25/RRF/MMR");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

/**
 * @description 生成含标题行和单条数据行的 XLSX 工作簿夹具。
 * @param {Array<*>} headers 表头。
 * @param {Array<*>} row 数据行。
 * @returns {Buffer} XLSX 二进制内容。
 */
function workbook(headers, row) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([headers, row]), "景点");
  return XLSX.write(book, { type: "buffer", bookType: "xlsx" });
}

/**
 * @description 生成包含单个 UTF-16BE 文本操作符的最小 PDF 夹具。
 * @param {string} text 页面文本。
 * @returns {Buffer} PDF 二进制内容。
 */
function textPdf(text) {
  const bytes = Buffer.from(`\ufeff${text}`, "utf16le");
  const swapped = Buffer.alloc(bytes.length);
  for (let index = 0; index + 1 < bytes.length; index += 2) {
    swapped[index] = bytes[index + 1];
    swapped[index + 1] = bytes[index];
  }
  const stream = `BT /F1 12 Tf 72 720 Td <${swapped.toString("hex")}> Tj ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /Contents 4 0 R >> endobj",
    `4 0 obj << /Length ${Buffer.byteLength(stream, "latin1")} >> stream\n${stream}\nendstream endobj`
  ];
  return Buffer.from(`%PDF-1.4\n${objects.join("\n")}\n%%EOF`, "latin1");
}

/**
 * @description 向 ZIP 二进制末尾追加最小中央目录项。
 * @param {Buffer} buffer 原始 ZIP 或 XLSX 内容。
 * @param {string} fileName 目录项文件名。
 * @returns {Buffer} 追加目录项后的内容。
 */
function appendZipDirectoryEntry(buffer, fileName) {
  const name = Buffer.from(fileName, "utf8");
  const entry = Buffer.alloc(46 + name.length);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt32LE(1, 20);
  entry.writeUInt32LE(1, 24);
  entry.writeUInt16LE(name.length, 28);
  name.copy(entry, 46);
  return Buffer.concat([buffer, entry]);
}

/**
 * @description 追加带指定压缩前后大小的 ZIP 中央目录项，用于膨胀率测试。
 * @param {Buffer} buffer 原始 ZIP 或 XLSX 内容。
 * @param {string} fileName 目录项文件名。
 * @param {number} compressedSize 声明压缩大小。
 * @param {number} uncompressedSize 声明解压大小。
 * @returns {Buffer} 追加压力目录项后的内容。
 */
function appendZipPressureEntry(buffer, fileName, compressedSize, uncompressedSize) {
  const name = Buffer.from(fileName, "utf8");
  const entry = Buffer.alloc(46 + name.length);
  entry.writeUInt32LE(0x02014b50, 0);
  entry.writeUInt32LE(compressedSize, 20);
  entry.writeUInt32LE(uncompressedSize, 24);
  entry.writeUInt16LE(name.length, 28);
  name.copy(entry, 46);
  return Buffer.concat([buffer, entry]);
}
