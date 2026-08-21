/**
 * @fileoverview 云端 OpenAI Chat Completions 兼容供应商与离线确定性模拟供应商的统一适配层。
 *
 * 支持超时、重试、流式响应和供应商实例缓存；演示模式缺少密钥时使用基于检索元数据的本地回答。
 *
 * @typedef {{role: "system"|"user"|"assistant", content: string}} LlmMessage
 * @typedef {{text: string, model: string, provider: string, usage: object|null}} LlmCompletion
 * @typedef {{messages?: LlmMessage[], meta?: object, temperature?: number, maxTokens?: number, signal?: AbortSignal}} LlmRequestOptions
 */
import { config } from "../config.mjs";
import { logInfo, logError } from "../logger.mjs";
import { composeMockAnswer } from "./mockComposer.mjs";

/**
 * 带 HTTP 状态码和业务错误码的大模型服务异常。
 * @extends Error
 * @example
 * throw new LlmError("模型不可用", { statusCode: 503, code: "LLM_UNAVAILABLE" });
 */
class LlmError extends Error {
  /**
   * @param {string} message 错误说明。
   * @param {{statusCode?: number, code?: string}} [options={}] HTTP 与业务错误信息。
   */
  constructor(message, { statusCode = 502, code = "LLM_ERROR" } = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * 等待指定时长，用于重试退避和模拟流式输出。
 * @private
 * @param {number} ms 等待毫秒数。
 * @returns {Promise<void>} 计时结束后兑现的 Promise。
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 判断 HTTP 状态是否适合自动重试。
 * @private
 * @param {number} status HTTP 状态码。
 * @returns {boolean} 限流或服务端错误时为 `true`。
 */
function isRetryable(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

/**
 * OpenAI Chat Completions 兼容供应商实现，可连接 DeepSeek、通义兼容模式、Moonshot 等服务。
 */
class OpenAiCompatibleProvider {
  /**
   * 初始化真实云端供应商。
   * @param {{baseUrl: string, apiKey: string, model: string, timeoutMs: number, maxRetries: number, temperature: number}} options 供应商配置。
   * @throws {LlmError} 缺少 API Key 时抛出 `LLM_API_KEY_MISSING`。
   */
  constructor(options) {
    this.name = "openai";
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.model = options.model;
    this.timeoutMs = options.timeoutMs;
    this.maxRetries = options.maxRetries;
    this.defaultTemperature = options.temperature;

    if (!this.apiKey) {
      // Surface a clear, actionable error instead of a vague network failure.
      throw new LlmError(
        "LLM_API_KEY is missing. Set LLM_PROVIDER=mock for offline demo, or provide LLM_API_KEY.",
        { statusCode: 500, code: "LLM_API_KEY_MISSING" }
      );
    }
  }

  /**
   * 根据模型能力构建 Chat Completions 请求体。
   * @param {{messages: LlmMessage[], temperature?: number, maxTokens?: number, stream?: boolean}} options 请求参数。
   * @returns {object} OpenAI 兼容请求体；GPT-5 系列使用 `max_completion_tokens`。
   */
  buildBody({ messages, temperature, maxTokens, stream }) {
    const body = {
      model: this.model,
      messages: messages.map((item) => ({ role: item.role, content: item.content })),
      stream: Boolean(stream)
    };

    // GPT-5-family Chat Completions models use max_completion_tokens. Omitting
    // temperature also supports reasoning variants with fixed sampling.
    if (/^gpt-5(?:[.-]|$)/i.test(this.model)) {
      body.max_completion_tokens = maxTokens ?? 700;
    } else {
      body.temperature = temperature ?? this.defaultTemperature;
      body.max_tokens = maxTokens ?? 700;
    }

    return body;
  }

  /**
   * 向上游发送请求，并对限流、服务端错误和网络故障进行有限重试。
   * @param {object} body Chat Completions 请求体。
   * @param {{signal?: AbortSignal}} [options={}] 可选的外部中止信号。
   * @returns {Promise<Response>} 成功的上游 HTTP 响应。
   * @throws {LlmError} 上游错误、超时或网络失败时分别抛出 `LLM_UPSTREAM_ERROR`、`LLM_TIMEOUT` 或 `LLM_NETWORK_ERROR`。
   */
  async request(body, { signal } = {}) {
    let lastError = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      /** 将外部取消信号转发给本次上游请求。 @returns {void} */
      const onAbort = () => controller.abort();
      if (signal) {
        signal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        const response = await fetch(`${this.baseUrl}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          if (isRetryable(response.status) && attempt < this.maxRetries) {
            lastError = new LlmError(`LLM upstream ${response.status}: ${detail.slice(0, 200)}`);
            await sleep(300 * (attempt + 1));
            continue;
          }
          throw new LlmError(`LLM upstream ${response.status}: ${detail.slice(0, 200)}`, {
            statusCode: 502,
            code: "LLM_UPSTREAM_ERROR"
          });
        }

        return response;
      } catch (error) {
        if (error instanceof LlmError && error.code === "LLM_UPSTREAM_ERROR") {
          throw error;
        }
        lastError = error;
        const aborted = error.name === "AbortError";
        if (attempt < this.maxRetries && !(signal && signal.aborted)) {
          await sleep(300 * (attempt + 1));
          continue;
        }
        throw new LlmError(
          aborted ? `LLM request timed out after ${this.timeoutMs}ms.` : `LLM request failed: ${error.message}`,
          { statusCode: 504, code: aborted ? "LLM_TIMEOUT" : "LLM_NETWORK_ERROR" }
        );
      } finally {
        clearTimeout(timer);
        if (signal) {
          signal.removeEventListener("abort", onAbort);
        }
      }
    }

    throw lastError || new LlmError("LLM request failed after retries.");
  }

  /**
   * 执行一次非流式补全。
   * @param {LlmRequestOptions} options 请求选项。
   * @returns {Promise<LlmCompletion>} 回答文本、实际模型、供应商和用量。
   * @throws {LlmError} 请求失败时透传供应商异常。
   */
  async complete({ messages, temperature, maxTokens, signal }) {
    const body = this.buildBody({ messages, temperature, maxTokens, stream: false });
    const response = await this.request(body, { signal });
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content?.trim() || "";
    return {
      text,
      model: payload?.model || this.model,
      provider: this.name,
      usage: payload?.usage || null
    };
  }

  /**
   * 执行流式补全并解析上游 SSE 的文本增量。
   * @param {LlmRequestOptions} options 请求选项。
   * @returns {AsyncGenerator<string, void, void>} 按到达顺序产生的回答片段。
   * @throws {LlmError} 请求建立或读取失败时透传供应商异常。
   */
  async *stream({ messages, temperature, maxTokens, signal }) {
    const body = this.buildBody({ messages, temperature, maxTokens, stream: true });
    const response = await this.request(body, { signal });
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) {
          continue;
        }
        const data = trimmed.slice("data:".length).trim();
        if (data === "[DONE]") {
          return;
        }
        try {
          const json = JSON.parse(data);
          const delta = json?.choices?.[0]?.delta?.content;
          if (delta) {
            yield delta;
          }
        } catch {
          // ignore malformed keep-alive lines
        }
      }
    }
  }
}

/**
 * 离线确定性供应商，根据 `meta` 中的检索上下文组合导游回答，不依赖云端服务。
 */
class MockProvider {
  /** 初始化模拟供应商的固定名称和模型标识。 */
  constructor() {
    this.name = "mock";
    this.model = "lingshan-mock-1";
  }

  /**
   * 根据结构化元数据同步组合回答，并包装为异步补全结果。
   * @param {{meta?: object}} options 请求选项。
   * @returns {Promise<LlmCompletion>} 不含用量信息的模拟回答。
   */
  async complete({ meta }) {
    const text = composeMockAnswer(meta || {});
    return {
      text,
      model: this.model,
      provider: this.name,
      usage: null
    };
  }

  /**
   * 按可口播句段模拟流式输出。
   * @param {LlmRequestOptions} options 请求选项。
   * @returns {AsyncGenerator<string, void, void>} 回答句段。
   */
  async *stream(options) {
    const { text } = await this.complete(options);
    // Split into speakable segments so first-sentence latency stays low (V4-11).
    const segments = text.split(/(?<=[。！？\n])/).filter((part) => part.trim());
    for (const segment of segments) {
      yield segment;
      await sleep(12);
    }
  }
}

/** @type {OpenAiCompatibleProvider|MockProvider|null} 最近一次构建并复用的供应商实例。 */
let cachedProvider = null;
/** @type {string} 供应商缓存对应的配置签名。 */
let cachedKey = "";

/**
 * 按当前配置获取供应商，并在供应商、模型和地址未变化时复用实例。
 * @returns {OpenAiCompatibleProvider|MockProvider} 真实或模拟供应商。
 * @throws {LlmError} 配置要求真实供应商但缺少 API Key 时抛出。
 * @example
 * const provider = getLlmProvider();
 */
export function getLlmProvider() {
  const key = `${config.llm.provider}:${config.llm.model}:${config.llm.baseUrl}`;
  if (cachedProvider && cachedKey === key) {
    return cachedProvider;
  }

  const useMockFallback = config.demoMode && (!config.llm.apiKey || config.llm.provider === "mock");
  const provider = config.llm.provider === "openai" && !useMockFallback
    ? new OpenAiCompatibleProvider(config.llm)
    : new MockProvider();

  logInfo("llm provider ready", { provider: provider.name, model: provider.model });
  cachedProvider = provider;
  cachedKey = key;
  return provider;
}

/**
 * 执行非流式大模型补全并记录失败日志。
 * `meta` 供模拟供应商使用，真实供应商只读取 `messages`。
 * @param {LlmRequestOptions} options 请求选项。
 * @returns {Promise<LlmCompletion>} 补全结果。
 * @throws {LlmError|Error} 供应商初始化或补全失败时透传异常。
 * @example
 * const result = await llmComplete({ messages: [{ role: "user", content: "介绍灵山大佛" }] });
 */
export async function llmComplete({ messages, meta, temperature, maxTokens, signal }) {
  const provider = getLlmProvider();
  try {
    return await provider.complete({ messages, meta, temperature, maxTokens, signal });
  } catch (error) {
    logError("llm complete failed", { provider: provider.name, error: error.message });
    throw error;
  }
}

/**
 * 以统一接口流式输出真实或模拟供应商的文本片段。
 * @param {LlmRequestOptions} options 请求选项。
 * @returns {AsyncGenerator<string, void, void>} 文本片段流。
 * @throws {LlmError|Error} 供应商初始化、请求或流读取失败时透传异常。
 * @example
 * for await (const chunk of llmStream({ messages })) process.stdout.write(chunk);
 */
export async function* llmStream({ messages, meta, temperature, maxTokens, signal }) {
  const provider = getLlmProvider();
  yield* provider.stream({ messages, meta, temperature, maxTokens, signal });
}

export { LlmError };
