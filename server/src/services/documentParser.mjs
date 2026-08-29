/**
 * @fileoverview 可选的云文档解析适配层。
 *
 * @description 该模块只负责“提交、查询状态、获取解析结果”三类外部调用，不负责修改知识库。
 * 真实 SDK 采用动态加载，未安装依赖或未配置凭据时不会影响本地文本解析路径。
 * 所有外部客户端均可注入，便于离线测试、故障演练和后续替换供应商。
 */
import { Readable } from "node:stream";

/**
 * @description 定义云文档解析任务的终态集合。
 * @type {ReadonlySet<string>} 云解析任务的终态。
 */
const TERMINAL_STATUSES = new Set(["succeeded", "failed"]);

/**
 * @description 从环境变量构建文档解析配置。
 *
 * 凭据只保存在内存配置中，不会被返回到 API、日志或测试报告。
 * @param {NodeJS.ProcessEnv|Record<string, string|undefined>} [env=process.env] 环境变量。
 * @returns {Readonly<object>} 文档解析配置快照。
 * @example
 * const parserConfig = buildDocumentParserConfig({
 *   DOCUMENT_PARSER_ENABLED: "true",
 *   DOCUMENT_PARSER_PROVIDER: "aliyun_docmind"
 * });
 */
export function buildDocumentParserConfig(env = process.env) {
  return Object.freeze({
    enabled: toBoolean(env.DOCUMENT_PARSER_ENABLED, false),
    provider: String(env.DOCUMENT_PARSER_PROVIDER || "aliyun_docmind").trim(),
    endpoint: String(env.DOCUMENT_PARSER_ENDPOINT || "docmind-api.cn-hangzhou.aliyuncs.com").trim(),
    regionId: String(env.DOCUMENT_PARSER_REGION_ID || "cn-hangzhou").trim(),
    accessKeyId: String(env.DOCUMENT_PARSER_ACCESS_KEY_ID || "").trim(),
    accessKeySecret: String(env.DOCUMENT_PARSER_ACCESS_KEY_SECRET || "").trim(),
    timeoutMs: boundedNumber(env.DOCUMENT_PARSER_TIMEOUT_MS, 10_000, 300, 60_000),
    pollIntervalMs: boundedNumber(env.DOCUMENT_PARSER_POLL_INTERVAL_MS, 3_000, 0, 300_000),
    maxAttempts: boundedNumber(env.DOCUMENT_PARSER_MAX_ATTEMPTS, 20, 1, 100),
    leaseMs: boundedNumber(env.DOCUMENT_PARSER_LEASE_MS, 120_000, 5_000, 900_000),
    layoutStepSize: boundedNumber(env.DOCUMENT_PARSER_LAYOUT_STEP_SIZE, 100, 1, 3_000),
    llmEnhancement: toBoolean(env.DOCUMENT_PARSER_LLM_ENHANCEMENT, false),
    enhancementMode: String(env.DOCUMENT_PARSER_ENHANCEMENT_MODE || "VLM").trim(),
    outputFormat: parseOutputFormat(env.DOCUMENT_PARSER_OUTPUT_FORMAT)
  });
}

/**
 * @description 判断云文档解析是否已经具备执行条件。
 * @param {object} config 文档解析配置。
 * @param {{clientProvided?: boolean}} [options={}] 是否由调用方注入了客户端。
 * @returns {boolean} 可以执行时为 `true`。
 * @example
 * const ready = isDocumentParserReady(parserConfig, { clientProvided: true });
 */
export function isDocumentParserReady(config, { clientProvided = false } = {}) {
  return config?.enabled === true
    && config.provider === "aliyun_docmind"
    && (clientProvided || Boolean(config.accessKeyId && config.accessKeySecret));
}

/**
 * @description 提交本地文件到云文档解析服务。
 * @param {{buffer: Buffer, fileName: string, mimeType?: string, config: object, client?: object, runtime?: object}} input 提交参数。
 * @returns {Promise<{jobId: string, provider: string}>} 外部任务标识。
 * @throws {Error & {code: string, statusCode: number}} 配置、SDK或响应异常时抛出。
 * @example
 * const submission = await submitDocumentParsing({
 *   buffer: documentBuffer,
 *   fileName: "guide.pdf",
 *   config: parserConfig,
 *   client
 * });
 */
export async function submitDocumentParsing({
  buffer,
  fileName,
  mimeType = "application/octet-stream",
  config,
  client,
  runtime
}) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw parserError("DOCUMENT_PARSER_INPUT_INVALID", "A non-empty document buffer is required.", 422, false);
  }
  if (!fileName || typeof fileName !== "string") {
    throw parserError("DOCUMENT_PARSER_FILE_NAME_REQUIRED", "A document file name is required.", 422, false);
  }
  if (!isDocumentParserReady(config, { clientProvided: Boolean(client) })) {
    throw parserError("DOCUMENT_PARSER_NOT_CONFIGURED", "The document parser is not configured.", 409, false);
  }

  const resolved = client || await createAliyunDocMindClient(config);
  const request = createRequest(resolved, "SubmitDocParserJobAdvanceRequest");
  request.fileUrlObject = Readable.from([buffer]);
  request.fileName = fileName;
  request.fileNameExtension = extensionFor(fileName);
  request.llmEnhancement = config.llmEnhancement;
  if (config.llmEnhancement && config.enhancementMode) {
    request.enhancementMode = config.enhancementMode;
  }
  request.outputFormat = config.outputFormat;

  const response = await callClient(resolved, "submitDocParserJobAdvance", request, runtime, config.timeoutMs);
  const jobId = extractJobId(response);
  if (!jobId) {
    throw parserError("DOCUMENT_PARSER_SUBMIT_RESPONSE_INVALID", "The document parser did not return a job id.");
  }
  return { jobId, provider: config.provider };
}

/**
 * @description 查询外部文档解析任务状态。
 * @param {{jobId: string, config: object, client?: object, runtime?: object}} input 查询参数。
 * @returns {Promise<{status: "queued"|"processing"|"succeeded"|"failed"|"unknown", progress: number|null, raw: object}>} 规范化状态。
 * @throws {Error & {code: string, statusCode: number}} 外部调用异常时抛出。
 * @example
 * const status = await queryDocumentParsingStatus({
 *   jobId: submission.jobId,
 *   config: parserConfig,
 *   client
 * });
 */
export async function queryDocumentParsingStatus({ jobId, config, client, runtime }) {
  if (!jobId || typeof jobId !== "string") {
    throw parserError("DOCUMENT_PARSER_JOB_ID_REQUIRED", "A document parser job id is required.", 422, false);
  }
  if (!isDocumentParserReady(config, { clientProvided: Boolean(client) })) {
    throw parserError("DOCUMENT_PARSER_NOT_CONFIGURED", "The document parser is not configured.", 409, false);
  }
  const resolved = client || await createAliyunDocMindClient(config);
  const request = createRequest(resolved, "QueryDocParserStatusRequest");
  request.id = jobId;
  const response = await callClient(resolved, "queryDocParserStatus", request, runtime, config.timeoutMs);
  const raw = unwrapBody(response);
  const data = unwrapData(raw);
  const rawStatus = String(data.Status ?? data.status ?? "").trim().toLowerCase();
  const status = rawStatus === "init" || rawStatus === "queued"
    ? "queued"
    : rawStatus === "processing"
      ? "processing"
      : rawStatus === "success" || rawStatus === "succeeded"
        ? "succeeded"
        : rawStatus === "fail" || rawStatus === "failed"
          ? "failed"
          : "unknown";
  const progress = Number(data.Processing ?? data.processing);
  return {
    status,
    progress: Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : null,
    raw: sanitizeParserPayload(raw)
  };
}

/**
 * @description 获取解析结果。长文档按 layout 分页，避免一次性请求超大结果。
 * @param {{jobId: string, config: object, client?: object, runtime?: object}} input 查询参数。
 * @returns {Promise<{text: string, layoutCount: number, raw: object}>} 规范化文本结果。
 * @throws {Error & {code: string, statusCode: number}} 外部调用或结果为空时抛出。
 * @example
 * const parsed = await getDocumentParsingResult({
 *   jobId: submission.jobId,
 *   config: parserConfig,
 *   client
 * });
 */
export async function getDocumentParsingResult({ jobId, config, client, runtime }) {
  if (!jobId || typeof jobId !== "string") {
    throw parserError("DOCUMENT_PARSER_JOB_ID_REQUIRED", "A document parser job id is required.", 422, false);
  }
  if (!isDocumentParserReady(config, { clientProvided: Boolean(client) })) {
    throw parserError("DOCUMENT_PARSER_NOT_CONFIGURED", "The document parser is not configured.", 409, false);
  }

  const resolved = client || await createAliyunDocMindClient(config);
  const layouts = [];
  let directText = "";
  let layoutNum = 0;
  let lastRaw = {};

  for (let page = 0; page < config.maxAttempts; page += 1) {
    const request = createRequest(resolved, "GetDocParserResultRequest");
    request.id = jobId;
    request.layoutNum = layoutNum;
    request.layoutStepSize = config.layoutStepSize;
    const response = await callClient(resolved, "getDocParserResult", request, runtime, config.timeoutMs);
    const raw = unwrapBody(response);
    lastRaw = sanitizeParserPayload(raw);
    const data = parseMaybeJson(unwrapData(raw));
    if (typeof data === "string") {
      directText += data;
      break;
    }
    const markdown = data.markdown ?? data.Markdown ?? data.text ?? data.Text;
    if (typeof markdown === "string" && markdown.trim()) {
      directText += `${directText ? "\n" : ""}${markdown}`;
    }
    const pageLayouts = Array.isArray(data.layouts)
      ? data.layouts
      : Array.isArray(data.Layout)
        ? data.Layout
        : Array.isArray(data.layout)
          ? data.layout
          : [];
    if (pageLayouts.length === 0) break;
    layouts.push(...pageLayouts);
    layoutNum += pageLayouts.length;
    if (pageLayouts.length < config.layoutStepSize) break;
  }

  const text = directText.trim() || orderLayouts(layouts)
    .map((layout) => layout.markdown ?? layout.text ?? layout.Text ?? layout.content ?? "")
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!text) {
    throw parserError("DOCUMENT_PARSER_RESULT_EMPTY", "The document parser returned no indexable text.", 422, false);
  }
  return { text, layoutCount: layouts.length, raw: lastRaw };
}

/**
 * @description 按页、分栏和纵向坐标重排版面块；无坐标时保持服务端原顺序。
 * @param {object[]} layouts DocMind 版面块。
 * @returns {object[]} 阅读顺序版面块。
 * @example
 * const ordered = orderLayouts([
 *   { page: 1, bbox: { x: 20, y: 120 }, text: "第二段" },
 *   { page: 1, bbox: { x: 20, y: 20 }, text: "第一段" }
 * ]);
 */
export function orderLayouts(layouts = []) {
  const annotated = layouts.map((layout, sourceIndex) => ({
    layout,
    sourceIndex,
    page: Number(layout.page ?? layout.pageNum ?? layout.PageNum ?? layout.page_number ?? 1),
    box: layoutBox(layout)
  }));
  const pages = new Map();
  for (const item of annotated) {
    const group = pages.get(item.page) || [];
    group.push(item);
    pages.set(item.page, group);
  }
  const ordered = [];
  for (const [, pageItems] of [...pages.entries()].sort(([left], [right]) => left - right)) {
    if (pageItems.some((item) => !item.box)) {
      ordered.push(...pageItems.sort((left, right) => left.sourceIndex - right.sourceIndex));
      continue;
    }
    const byX = [...pageItems].sort((left, right) => left.box.x - right.box.x);
    let largestGap = 0;
    let splitAt = -1;
    for (let index = 1; index < byX.length; index += 1) {
      const gap = byX[index].box.x - byX[index - 1].box.x;
      if (gap > largestGap) {
        largestGap = gap;
        splitAt = index;
      }
    }
    const columns = largestGap >= 80 && splitAt > 0
      ? [byX.slice(0, splitAt), byX.slice(splitAt)]
      : [pageItems];
    for (const column of columns) {
      ordered.push(...column.sort((left, right) => left.box.y - right.box.y || left.box.x - right.box.x));
    }
  }
  return ordered.map((item) => item.layout);
}

/**
 * @description 左上坐标。
 * @param {object} layout 版面块。
 * @returns {{x:number,y:number}|null} 左上坐标。
 */
function layoutBox(layout) {
  const value = layout.bbox ?? layout.box ?? layout.boundingBox ?? layout.polygon;
  if (Array.isArray(value) && value.length >= 2) {
    if (Array.isArray(value[0])) {
      const xs = value.map((point) => Number(point?.[0])).filter(Number.isFinite);
      const ys = value.map((point) => Number(point?.[1])).filter(Number.isFinite);
      return xs.length && ys.length ? { x: Math.min(...xs), y: Math.min(...ys) } : null;
    }
    const numbers = value.map(Number).filter(Number.isFinite);
    return numbers.length >= 2 ? { x: numbers[0], y: numbers[1] } : null;
  }
  if (value && typeof value === "object") {
    const x = Number(value.x ?? value.left ?? value.x1);
    const y = Number(value.y ?? value.top ?? value.y1);
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
  return null;
}

/**
 * @description 在 worker 内轮询任务直到终态；HTTP 上传流程不应直接调用此函数。
 * @param {{jobId: string, config: object, client?: object, runtime?: object, sleep?: (ms:number)=>Promise<void>}} input 轮询参数。
 * @returns {Promise<{status: string, result?: object, attempts: number}>} 终态结果。
 * @throws {Error & {code: string, statusCode: number}} 超时或任务失败时抛出。
 * @example
 * const completed = await pollDocumentParsingJob({
 *   jobId: submission.jobId,
 *   config: parserConfig,
 *   client
 * });
 */
export async function pollDocumentParsingJob({
  jobId,
  config,
  client,
  runtime,
  sleep = delay
}) {
  for (let attempts = 1; attempts <= config.maxAttempts; attempts += 1) {
    const status = await queryDocumentParsingStatus({ jobId, config, client, runtime });
    if (status.status === "succeeded") {
      return { status: status.status, result: await getDocumentParsingResult({ jobId, config, client, runtime }), attempts };
    }
    if (status.status === "failed") {
      throw parserError("DOCUMENT_PARSER_JOB_FAILED", "The document parser job failed.", 422, false);
    }
    if (attempts < config.maxAttempts && config.pollIntervalMs > 0) {
      await sleep(config.pollIntervalMs);
    }
  }
  throw parserError("DOCUMENT_PARSER_POLL_TIMEOUT", "The document parser job did not finish within the retry budget.", 504, true);
}

/**
 * @description 动态加载官方 Node.js SDK 并创建客户端。
 * @param {object} config 文档解析配置。
 * @param {{sdkLoader?: () => Promise<object>}} [options={}] 可注入 SDK 加载器。
 * @returns {Promise<object>} 官方 SDK 客户端。
 * @throws {Error & {code: string, statusCode: number}} SDK 缺失、结构无效或凭据缺失时抛出。
 * @example
 * const client = await createAliyunDocMindClient(parserConfig);
 */
export async function createAliyunDocMindClient(config, { sdkLoader = loadAliyunSdk } = {}) {
  if (!config?.accessKeyId || !config?.accessKeySecret) {
    throw parserError("DOCUMENT_PARSER_CREDENTIALS_MISSING", "Document parser credentials are not configured.", 409, false);
  }
  let sdk;
  try {
    sdk = await sdkLoader();
  } catch {
    throw parserError("DOCUMENT_PARSER_SDK_MISSING", "Install the optional Alibaba Cloud Document Mind SDK before enabling document parsing.", 503, false);
  }
  const Client = sdk.Client;
  if (typeof Client !== "function") {
    throw parserError("DOCUMENT_PARSER_SDK_INVALID", "The installed document parser SDK is invalid.", 503, false);
  }
  const client = new Client({
    endpoint: config.endpoint,
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    type: "access_key",
    regionId: config.regionId
  });
  for (const name of [
    "SubmitDocParserJobAdvanceRequest",
    "QueryDocParserStatusRequest",
    "GetDocParserResultRequest"
  ]) {
    if (typeof sdk[name] === "function") {
      Object.defineProperty(client, name, { value: sdk[name], enumerable: false });
    }
  }
  if (typeof sdk.RuntimeOptions === "function") {
    Object.defineProperty(client, "__runtimeOptions", {
      value: new sdk.RuntimeOptions({
        readTimeout: config.timeoutMs,
        connectTimeout: config.timeoutMs,
        autoretry: false,
        maxAttempts: 1
      }),
      enumerable: false
    });
  }
  return client;
}

/**
 * @description 动态加载可选的阿里云文档智能解析 SDK。
 * @returns {Promise<object>} 动态加载的可选 SDK。
 */
async function loadAliyunSdk() {
  const [sdkModule, teaModule] = await Promise.all([
    import("@alicloud/docmind-api20220711"),
    import("@alicloud/tea-util")
  ]);
  const commonJsExports = sdkModule.default && typeof sdkModule.default === "object"
    ? sdkModule.default
    : {};
  return {
    Client: sdkModule.default?.default || sdkModule.Client || sdkModule.default,
    RuntimeOptions: teaModule.RuntimeOptions || teaModule.default?.RuntimeOptions,
    SubmitDocParserJobAdvanceRequest: sdkModule.SubmitDocParserJobAdvanceRequest
      || commonJsExports.SubmitDocParserJobAdvanceRequest,
    QueryDocParserStatusRequest: sdkModule.QueryDocParserStatusRequest
      || commonJsExports.QueryDocParserStatusRequest,
    GetDocParserResultRequest: sdkModule.GetDocParserResultRequest
      || commonJsExports.GetDocParserResultRequest
  };
}

/**
 * @description 根据请求类名创建阿里云 SDK 请求对象。
 * @param {object} client 客户端。
 * @param {string} name 请求类名。
 * @returns {object} 请求对象。
 */
function createRequest(client, name) {
  const Request = client?.[name];
  return typeof Request === "function" ? new Request() : {};
}

/**
 * @description 调用指定的阿里云 SDK 方法，并以统一超时控制等待响应。
 * @param {object} client 客户端。
 * @param {string} method 方法名。
 * @param {object} request 请求对象。
 * @param {object} [runtime] SDK运行参数。
 * @param {number} timeoutMs 请求超时。
 * @returns {Promise<object>} SDK响应。
 * @throws {Error & {code: "DOCUMENT_PARSER_CLIENT_INVALID", statusCode: number}} 客户端未实现指定方法时抛出。
 * @throws {Error & {code: "DOCUMENT_PARSER_REQUEST_TIMEOUT", statusCode: 504}} 请求超过处理时限时抛出。
 * @throws {Error} SDK 方法调用失败时透传上游异常。
 */
async function callClient(client, method, request, runtime, timeoutMs) {
  if (typeof client?.[method] !== "function") {
    throw parserError("DOCUMENT_PARSER_CLIENT_INVALID", `The document parser client does not implement ${method}.`, 503, false);
  }
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => client[method](request, runtime || client.__runtimeOptions)),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(parserError(
          "DOCUMENT_PARSER_REQUEST_TIMEOUT",
          `The document parser request ${method} exceeded the processing timeout.`,
          504,
          true
        )), Math.max(1, Number(timeoutMs) || 1));
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @description body对象。
 * @param {object} response SDK响应。
 * @returns {object} body对象。
 */
function unwrapBody(response) {
  return response?.body || response?.Body || response || {};
}

/**
 * @description Data字段。
 * @param {object} body SDK body。
 * @returns {*} Data字段。
 */
function unwrapData(body) {
  return body?.Data ?? body?.data ?? body;
}

/**
 * @description 从文档解析提交响应中提取任务 ID。
 * @param {object} response 提交响应。
 * @returns {string|null} 任务ID。
 */
function extractJobId(response) {
  const body = unwrapBody(response);
  const data = unwrapData(body);
  return String(data?.Id ?? data?.id ?? body?.Id ?? body?.id ?? "").trim() || null;
}

/**
 * @description 尝试解析可能为 JSON 文本的外部响应值。
 * @param {*} value 可能是JSON文本的值。
 * @returns {*} 解析后的值。
 */
function parseMaybeJson(value) {
  if (typeof value !== "string") return value || {};
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * @description 去除无关大字段后的可审计摘要。
 * @param {*} value 外部响应。
 * @returns {object} 去除无关大字段后的可审计摘要。
 */
function sanitizeParserPayload(value) {
  if (!value || typeof value !== "object") return {};
  const copy = { ...value };
  delete copy.layout;
  delete copy.Layout;
  delete copy.data;
  delete copy.Data;
  return copy;
}

/**
 * @description 扩展名。
 * @param {string} fileName 文件名。
 * @returns {string} 扩展名。
 */
function extensionFor(fileName) {
  const match = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/u);
  return match?.[1] || "";
}

/**
 * @description 将环境变量值转换为布尔配置。
 * @param {*} value 环境变量值。
 * @param {boolean} fallback 默认值。
 * @returns {boolean} 布尔值。
 */
function toBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

/**
 * @description 将配置值转换为限定范围内的整数。
 * @param {*} value 数值。
 * @param {number} fallback 默认值。
 * @param {number} min 最小值。
 * @param {number} max 最大值。
 * @returns {number} 限制后的整数。
 */
function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

/**
 * @description 将输出格式配置规范化为非空格式列表。
 * @param {*} value 输出格式配置。
 * @returns {string[]} 输出格式。
 */
function parseOutputFormat(value) {
  const values = String(value || "markdown")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? [...new Set(values)] : ["markdown"];
}

/**
 * @description 延迟Promise。
 * @param {number} milliseconds 延迟毫秒数。
 * @returns {Promise<void>} 延迟Promise。
 */
function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * @description 创建带稳定错误码、HTTP 状态和重试标记的文档解析异常。
 * @param {string} code 稳定错误码。
 * @param {string} message 脱敏错误消息。
 * @param {number} [statusCode=502] HTTP状态码。
 * @param {boolean} [retryable=true] 是否允许重试。
 * @returns {Error & {code:string,statusCode:number,retryable:boolean}} 错误对象。
 */
function parserError(code, message, statusCode = 502, retryable = true) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.retryable = retryable;
  return error;
}

export { TERMINAL_STATUSES };
