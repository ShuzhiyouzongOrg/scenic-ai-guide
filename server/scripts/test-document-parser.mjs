import assert from "node:assert";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDir = mkdtempSync(join(tmpdir(), "scenic-document-parser-"));
process.env.DATA_DIR = tempDir;
process.env.UPLOAD_DIR = join(tempDir, "uploads");
process.env.SQLITE_PATH = ":memory:";
process.env.DOCUMENT_PARSER_ENABLED = "true";
process.env.DOCUMENT_PARSER_ACCESS_KEY_ID = "test-access-key";
process.env.DOCUMENT_PARSER_ACCESS_KEY_SECRET = "test-secret";
process.env.DOCUMENT_PARSER_POLL_INTERVAL_MS = "0";
process.env.DOCUMENT_PARSER_MAX_ATTEMPTS = "5";
process.env.DOCUMENT_PARSER_LAYOUT_STEP_SIZE = "2";

try {
  const {
    buildDocumentParserConfig,
    createAliyunDocMindClient,
    getDocumentParsingResult,
    isDocumentParserReady,
    pollDocumentParsingJob,
    orderLayouts,
    queryDocumentParsingStatus,
    submitDocumentParsing
  } = await import("../src/services/documentParser.mjs");
  const config = buildDocumentParserConfig();
  assert.equal(isDocumentParserReady(config), true);
  assert.equal(isDocumentParserReady(buildDocumentParserConfig({ DOCUMENT_PARSER_ENABLED: "false" })), false);
  class SdkClientFixture {
    constructor(options) {
      this.options = options;
    }
  }
  class RequestFixture {}
  class RuntimeOptionsFixture {
    constructor(options) {
      this.options = options;
    }
  }
  const sdkClient = await createAliyunDocMindClient(config, {
    sdkLoader: async () => ({
      Client: SdkClientFixture,
      RuntimeOptions: RuntimeOptionsFixture,
      SubmitDocParserJobAdvanceRequest: RequestFixture,
      QueryDocParserStatusRequest: RequestFixture,
      GetDocParserResultRequest: RequestFixture
    })
  });
  assert.equal(sdkClient.options.accessKeyId, "test-access-key");
  assert.equal(sdkClient.SubmitDocParserJobAdvanceRequest, RequestFixture);
  assert.equal(sdkClient.__runtimeOptions.options.maxAttempts, 1);
  await assert.rejects(
    () => createAliyunDocMindClient(config, { sdkLoader: async () => { throw new Error("missing"); } }),
    (error) => error?.code === "DOCUMENT_PARSER_SDK_MISSING" && !error.message.includes("test-secret")
  );
  await assert.rejects(
    () => queryDocumentParsingStatus({
      jobId: "job-timeout",
      config: { ...config, timeoutMs: 10 },
      client: { queryDocParserStatus: () => new Promise(() => {}) }
    }),
    (error) => error?.code === "DOCUMENT_PARSER_REQUEST_TIMEOUT"
      && error.statusCode === 504
      && error.retryable === true
  );

  let statusCalls = 0;
  let resultCalls = 0;
  const client = {
    async submitDocParserJobAdvance(request) {
      assert.ok(["scan.pdf", "scan-guide.pdf"].includes(request.fileName));
      assert.equal(request.fileNameExtension, "pdf");
      assert.equal(request.outputFormat[0], "markdown");
      return { body: { data: { id: "job-test-1" } } };
    },
    async queryDocParserStatus(request) {
      assert.equal(request.id, "job-test-1");
      statusCalls += 1;
      return { body: { data: { Status: statusCalls === 1 ? "Processing" : "success", Processing: statusCalls === 1 ? 50 : 100 } } };
    },
    async getDocParserResult(request) {
      assert.equal(request.id, "job-test-1");
      resultCalls += 1;
      return { body: { data: { layouts: resultCalls === 1 ? [{ text: "# 景区说明" }, { text: "灵山大佛高88米" }] : [] } } };
    }
  };

  const submitted = await submitDocumentParsing({
    buffer: Buffer.from("%PDF-1.4 test"),
    fileName: "scan.pdf",
    mimeType: "application/pdf",
    config,
    client
  });
  assert.equal(submitted.jobId, "job-test-1");
  const status = await queryDocumentParsingStatus({ jobId: submitted.jobId, config, client });
  assert.equal(status.status, "processing");
  const polled = await pollDocumentParsingJob({ jobId: submitted.jobId, config, client, sleep: async () => {} });
  assert.equal(polled.status, "succeeded");
  assert.match(polled.result.text, /灵山大佛高88米/u);
  const ordered = orderLayouts([
    { text: "右栏下", page: 1, bbox: [420, 300, 520, 340] },
    { text: "左栏下", page: 1, bbox: [40, 300, 140, 340] },
    { text: "右栏上", page: 1, bbox: [420, 80, 520, 120] },
    { text: "左栏上", page: 1, bbox: [40, 80, 140, 120] },
    { text: "# 跨页标题", page: 2, bbox: [40, 40, 500, 80] },
    { text: "跨页标题正文", page: 3, bbox: [40, 40, 500, 80] }
  ]);
  assert.deepEqual(ordered.map((item) => item.text), [
    "左栏上", "左栏下", "右栏上", "右栏下", "# 跨页标题", "跨页标题正文"
  ]);

  const { createUpload, listUploads } = await import("../src/services/uploads.mjs");
  const { runDocumentParserTasks, listDocumentParserTasks } = await import("../src/services/documentParserTasks.mjs");
  resultCalls = 0;
  const scan = createUpload({
    fileName: "scan-guide.pdf",
    mimeType: "application/pdf",
    contentBase64: Buffer.from("%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF", "ascii").toString("base64")
  });
  assert.equal(scan.status, "needs_ocr");
  assert.equal(scan.errorCode, "PDF_OCR_QUEUED");
  assert.equal(listDocumentParserTasks()[0].status, "pending");
  const duplicateScan = createUpload({
    fileName: "renamed-scan.pdf",
    mimeType: "application/pdf",
    contentBase64: Buffer.from("%PDF-1.4\n1 0 obj << /Type /Page >> endobj\n%%EOF", "ascii").toString("base64")
  });
  assert.equal(duplicateScan.duplicate, true);
  assert.equal(listDocumentParserTasks().length, 1, "the task queue must remain idempotent");

  const { getDb } = await import("../src/db/database.mjs");
  getDb().prepare("UPDATE knowledge_processing_tasks SET status = 'running', lease_until = ? WHERE document_id = ?")
    .run(new Date(0).toISOString(), scan.id);

  const firstRun = await runDocumentParserTasks({ config, client, now: Date.now() });
  assert.equal(firstRun.waiting, 1);
  const secondRun = await runDocumentParserTasks({ config, client, now: Date.now() + 1_000 });
  assert.equal(secondRun.succeeded, 1);
  const finalUpload = listUploads().find((item) => item.id === scan.id);
  assert.equal(finalUpload.status, "processed");
  assert.equal(listDocumentParserTasks()[0].status, "succeeded");
  assert.equal(finalUpload.errorCode, null);
  console.log("PASS  document parser adapter, async queue, restart-safe state and OCR indexing");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
