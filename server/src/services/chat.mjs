// AI2-02..09 & AI2-13/14: RAG question-answering orchestration for the guide.
// Pipeline: guardrails -> FAQ cache -> follow-up rewrite -> retrieval ->
// scenario routing -> LLM (real or mock) -> length-checked answer + citations +
// quality/emotion labels + latency breakdown.

import { hybridSearch } from "./retrieval.mjs";
import { loadKnowledge } from "./knowledgeBuild.mjs";
import { llmComplete, llmStream } from "./llm.mjs";
import { buildMessages } from "./prompts.mjs";
import {
  detectSensitive,
  detectOutOfScope,
  detectEmotion,
} from "./guardrails.mjs";
import { getCachedAnswer, setCachedAnswer } from "./faqCache.mjs";
import { appendMessage, getHistory, getLastSpotName } from "./conversation.mjs";
import { mapAnswerToDigitalHumanState } from "./digitalHuman.mjs";
import { normalizeLocale } from "./language.mjs";
import { composeMockAnswer } from "./mockComposer.mjs";

const FOLLOW_UP_PRONOUNS = [
  "它",
  "他",
  "她",
  "这里",
  "那里",
  "这个",
  "那个",
  "这座",
  "那座",
  "it",
  "this",
  "that",
  "there",
  "그것",
  "그곳",
  "여기",
  "거기",
  "그거",
  "それ",
  "そこ",
  "ここ",
  "この場所",
  "あそこ",
  "這裡",
  "那裡",
  "這個",
  "那個",
  "มัน",
  "ที่นี่",
  "ที่นั่น",
  "สถานที่นี้",
  "แห่งนี้",
  "แห่งนั้น",
];

function nowMs() {
  return Date.now();
}

function maxTokensForMode(mode) {
  if (mode === "route") return 1600;
  if (mode === "explain") return 1000;
  return 700;
}

export function normalizeAssistantText(value) {
  return String(value || "")
    .replace(/```(?:[\w-]+)?\s*([\s\S]*?)```/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^\s)]+(?:\s+[^)]*)?\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\s*[-*+]\s+/gm, "• ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function hasRouteStructure(value) {
  const text = normalizeAssistantText(value);
  const numberedSteps = text.match(/(?:^|\s)\d{1,2}[.、.)）]\s*(?=\S)/g) || [];
  return numberedSteps.length >= 2;
}

function isUsableAnswer(value, requireRouteStructure = false) {
  const text = normalizeAssistantText(value);
  return Boolean(text) && (!requireRouteStructure || hasRouteStructure(text));
}

function fallbackAssistantText({ mode, results, locale }) {
  if (mode === "route" && results.length > 0) {
    const routeContent = normalizeAssistantText(results[0].content);
    if (routeContent) {
      if (locale === "en")
        return `Here is a recommended scenic route:\n\n${routeContent}`;
      if (locale === "ko") return `추천 관광 경로입니다.\n\n${routeContent}`;
      if (locale === "ja")
        return `おすすめの観光ルートです。\n\n${routeContent}`;
      if (locale === "zh-TW")
        return `為您推薦以下景區路線：\n\n${routeContent}`;
      if (locale === "th")
        return `เส้นทางท่องเที่ยวที่แนะนำคือ:\n\n${routeContent}`;
      return `为您推荐以下景区路线：\n\n${routeContent}`;
    }
  }
  if (locale === "en")
    return "The complete answer could not be generated. Please try again.";
  if (locale === "ko")
    return "전체 답변을 생성하지 못했습니다. 다시 시도해 주세요.";
  if (locale === "ja")
    return "完全な回答を生成できませんでした。もう一度お試しください。";
  if (locale === "zh-TW") return "暫時未能生成完整回答，請再試一次。";
  if (locale === "th")
    return "ไม่สามารถสร้างคำตอบที่สมบูรณ์ได้ โปรดลองอีกครั้ง";
  return "暂时未能生成完整回答，请再试一次。";
}

function knownSpotNames() {
  const knowledge = loadKnowledge();
  return (knowledge?.spots || []).flatMap(
    (spot) => spot.aliases || [spot.name],
  );
}

// AI2-06 & AI2-09: infer the answer mode from the question wording.
function inferMode(question, explicitMode) {
  if (explicitMode && ["qa", "explain", "route"].includes(explicitMode)) {
    return explicitMode;
  }
  if (
    /(路线|怎么玩|怎么逛|游览顺序|几小时|半日|一日|行程|安排|route|itinerary|recommend|경로|동선|추천|ルート|コース|提案|路線|行程|推薦|เส้นทาง|เที่ยวอย่างไร|ลำดับการเที่ยว|ครึ่งวัน|หนึ่งวัน|แนะนำ)/i.test(
      question,
    )
  ) {
    return "route";
  }
  if (
    /(详细介绍|讲解|讲讲|好好说说|多讲点|完整介绍|explain|tell me more|in detail|자세히|설명|詳しく|解説|詳細介紹|講解|อธิบาย|เล่าให้ฟัง|รายละเอียด|แนะนำสถานที่)/i.test(
      question,
    )
  ) {
    return "explain";
  }
  return "qa";
}

// AI2-07: rewrite a pronoun-only follow-up into a self-contained query by
// re-anchoring it to the last discussed spot.
function resolveFollowUp(question, sessionId) {
  const hasSubject = knownSpotNames().some((name) => question.includes(name));
  const looksLikeFollowUp =
    FOLLOW_UP_PRONOUNS.some((p) => question.includes(p)) ||
    question.length <= 6;
  if (hasSubject || !looksLikeFollowUp) {
    return { query: question, anchoredSpot: null };
  }
  const lastSpot = getLastSpotName(sessionId, knownSpotNames());
  if (!lastSpot) {
    return { query: question, anchoredSpot: null };
  }
  return { query: `${lastSpot} ${question}`, anchoredSpot: lastSpot };
}

// AI2-14: quality label for the answer.
function qualityLabel({ scenario, mode, emotion }) {
  if (
    scenario === "sensitive" ||
    scenario === "no_data" ||
    scenario === "out_of_scope"
  ) {
    return "拒答";
  }
  if (emotion && emotion !== "happy") {
    return "情感安抚";
  }
  if (mode === "route") {
    return "路线推荐";
  }
  if (scenario === "chitchat") {
    return "闲聊";
  }
  return "事实问答";
}

// Emotion tag to drive the digital human later (DH5-07). Kept simple + grounded.
function emotionTag({ scenario, label, emotion }) {
  if (
    scenario === "sensitive" ||
    scenario === "no_data" ||
    scenario === "out_of_scope"
  ) {
    return "抱歉";
  }
  if (emotion === "negative" || emotion === "confused" || emotion === "tired") {
    return "安抚";
  }
  if (label === "路线推荐") {
    return "微笑";
  }
  if (label === "闲聊") {
    return "微笑";
  }
  return "平静";
}

// Generic terms that alone should not qualify a question as "covered" — the
// scenic-area name appears in almost every chunk, so matching it proves nothing.
const GENERIC_TERMS = new Set([
  "灵山胜境",
  "灵山",
  "景区",
  "这里",
  "那里",
  "有没有",
  "请问",
  "介绍",
  "推荐",
  "lingshan",
  "scenic",
  "area",
  "please",
  "tell",
  "about",
  "recommend",
  "링산",
  "관광지",
  "알려",
  "추천",
  "霊山",
  "観光地",
  "教えて",
  "靈山",
  "景區",
  "介紹",
  "推薦",
]);

// True when the question's distinctive terms actually appear in retrieved text,
// so we are not just riding a generic scenic-area name match.
function retrievalIsRelevant(retrieval) {
  const spotMatched = (retrieval.spotMatches || []).length > 0;
  const intentDetected = (retrieval.intents || []).length > 0;
  if (spotMatched || intentDetected) {
    return true;
  }
  const salient = (retrieval.tokens || []).filter(
    (token) => !GENERIC_TERMS.has(token),
  );
  if (salient.length === 0) {
    return true;
  }
  const haystack = (retrieval.results || [])
    .slice(0, 3)
    .map((item) => `${item.title}${item.content}`)
    .join("")
    .normalize("NFKC")
    .toLowerCase();
  return salient.some((token) =>
    haystack.includes(String(token).normalize("NFKC").toLowerCase()),
  );
}

function classifyScenario({ question, retrieval, emotion }) {
  const results = retrieval?.results || [];
  const sensitive = detectSensitive(question);
  if (sensitive.sensitive) {
    return { scenario: "sensitive", sensitiveCategory: sensitive.category };
  }

  const outOfScope = detectOutOfScope(question);
  if (outOfScope.outOfScope) {
    return { scenario: "out_of_scope", otherPlace: outOfScope.place };
  }

  const isGreeting =
    /^(你好|您好|hi|hello|hey|在吗|在么|谢谢|感谢|再见|拜拜|안녕|감사|こんにちは|こんばんは|ありがとう|您好|謝謝)/i.test(
      question.trim(),
    ) || question.trim().length <= 3;

  if (results.length === 0) {
    // Greetings / thanks with no retrieval hit are chit-chat, not "no data".
    return { scenario: isGreeting ? "chitchat" : "no_data" };
  }

  // Low-confidence or only-generic-name matches -> treat as no_data to avoid
  // answering from material that does not actually cover the question.
  if (results[0].score < 12 || !retrievalIsRelevant(retrieval)) {
    return { scenario: isGreeting ? "chitchat" : "no_data" };
  }

  return { scenario: "grounded" };
}

function buildMeta({ scenario, mode, question, retrieval, extras }) {
  return {
    scenario,
    mode,
    question,
    results: retrieval?.results || [],
    intents: retrieval?.intents || [],
    spotMatches: retrieval?.spotMatches || [],
    ...extras,
  };
}

/**
 * Core RAG answer. Returns answer text, citations, labels, retrieval context and
 * a latency breakdown. Works identically for mock and real LLM providers.
 */
export async function answerQuestion({
  question,
  sessionId = "",
  mode: explicitMode,
  history: clientHistory,
  locale,
  signal,
} = {}) {
  const started = nowMs();
  const trimmed = String(question || "").trim();
  if (!trimmed) {
    const error = new Error("Question is required.");
    error.statusCode = 400;
    error.code = "QUESTION_REQUIRED";
    throw error;
  }

  const mode = inferMode(trimmed, explicitMode);
  const emotion = detectEmotion(trimmed);
  const responseLocale = normalizeLocale(locale, trimmed);
  const cacheQuestion = `${responseLocale}::${trimmed}`;

  // Route recommendations depend on the current request and must not reuse a
  // global FAQ answer that may have been generated from another session.
  const cached = mode === "route" ? null : getCachedAnswer(cacheQuestion, mode);
  if (cached) {
    const normalizedCachedAnswer = normalizeAssistantText(cached.answer);
    if (!normalizedCachedAnswer) {
      // Ignore an incompatible legacy cache entry and regenerate the answer.
    } else {
      const normalizedCached = { ...cached, answer: normalizedCachedAnswer };
      if (sessionId) {
        appendMessage(sessionId, {
          role: "user",
          content: trimmed,
          emotionLabel: emotion,
        });
        appendMessage(sessionId, {
          role: "assistant",
          content: normalizedCached.answer,
          intentLabel: normalizedCached.label,
          emotionLabel: normalizedCached.emotion,
          latencyMs: nowMs() - started,
        });
      }
      return {
        ...normalizedCached,
        cached: true,
        latency: {
          totalMs: nowMs() - started,
          retrievalMs: 0,
          llmMs: 0,
          cached: true,
        },
      };
    }
  }

  // AI2-07: re-anchor pronoun follow-ups to the last discussed spot.
  const { query, anchoredSpot } = resolveFollowUp(trimmed, sessionId);

  // Guardrails first, so we never retrieve or call the LLM for refusals.
  const preSensitive = detectSensitive(trimmed);
  const preScope = detectOutOfScope(trimmed);

  let retrieval = null;
  let retrievalMs = 0;
  if (!preSensitive.sensitive && !preScope.outOfScope) {
    const retrievalStart = nowMs();
    try {
      retrieval = hybridSearch(query, { limit: 5, locale: responseLocale });
    } catch (error) {
      if (error.code !== "KNOWLEDGE_NOT_BUILT") {
        throw error;
      }
      retrieval = { results: [], intents: [], spotMatches: [] };
    }
    retrievalMs = nowMs() - retrievalStart;
  }

  const { scenario, sensitiveCategory, otherPlace } = classifyScenario({
    question: trimmed,
    retrieval: retrieval || {
      results: [],
      intents: [],
      spotMatches: [],
      tokens: [],
    },
    emotion,
  });

  const meta = buildMeta({
    scenario,
    mode,
    question: trimmed,
    retrieval,
    extras: {
      sensitiveCategory,
      otherPlace,
      anchoredSpot,
      locale: responseLocale,
    },
  });

  const history =
    mode === "route"
      ? []
      : Array.isArray(clientHistory) && clientHistory.length
        ? clientHistory
        : getHistory(sessionId);

  // Real providers answer from messages; mock answers from meta. For refusal
  // scenarios we still call the provider so behavior is uniform (the mock
  // composes the refusal; the real model follows the system prompt).
  const results = scenario === "grounded" ? retrieval.results : [];
  const messages = buildMessages({
    mode,
    question: trimmed,
    results,
    history,
    locale: responseLocale,
  });
  const requireRouteStructure = mode === "route" && scenario === "grounded";

  const llmStart = nowMs();
  let completion = await llmComplete({
    messages,
    meta,
    maxTokens: maxTokensForMode(mode),
    signal,
  });
  let answerText = normalizeAssistantText(completion.text);
  if (!isUsableAnswer(answerText, requireRouteStructure)) {
    completion = await llmComplete({
      messages: [
        ...messages,
        {
          role: "user",
          content:
            "请重新完整回答。只输出纯文本，不要使用 Markdown，不要省略路线节点。",
        },
      ],
      meta,
      maxTokens: maxTokensForMode(mode),
      signal,
    });
    answerText = normalizeAssistantText(completion.text);
  }
  const llmMs = nowMs() - llmStart;
  if (!isUsableAnswer(answerText, requireRouteStructure)) {
    const groundedRouteFallback = requireRouteStructure
      ? normalizeAssistantText(composeMockAnswer(meta))
      : "";
    answerText = isUsableAnswer(groundedRouteFallback, requireRouteStructure)
      ? groundedRouteFallback
      : fallbackAssistantText({ mode, results, locale: responseLocale });
  }

  const label = qualityLabel({ scenario, mode, emotion });
  const emotionLabel = emotionTag({ scenario, label, emotion });
  const citations =
    scenario === "grounded"
      ? results.slice(0, 3).map((item) => item.citation)
      : [];

  const answerPayload = {
    answer: answerText,
    mode,
    locale: responseLocale,
    scenario,
    label,
    emotion: emotionLabel,
    citations,
    sources: citations.map((item) => ({
      documentName: item.documentName,
      sectionTitle: item.sectionTitle,
      scenicSpotName: item.scenicSpotName,
    })),
    retrieval: {
      total: retrieval?.results?.length || 0,
      intents: (retrieval?.intents || []).map((intent) => intent.intent),
      spotMatches: (retrieval?.spotMatches || []).map((spot) => spot.name),
      anchoredSpot,
    },
    provider: completion.provider,
    model: completion.model,
    digitalHuman: mapAnswerToDigitalHumanState({
      label,
      emotion: emotionLabel,
      scenario,
    }),
  };

  // AI2-12: cache stable factual answers for reuse. Route recommendations stay
  // request-scoped so conversation history cannot poison later sessions.
  if (mode !== "route" && scenario === "grounded" && answerText) {
    setCachedAnswer(cacheQuestion, mode, answerPayload);
  }

  if (sessionId) {
    appendMessage(sessionId, {
      role: "user",
      content: trimmed,
      emotionLabel: emotion,
    });
    appendMessage(sessionId, {
      role: "assistant",
      content: answerText,
      intentLabel: label,
      emotionLabel,
      latencyMs: nowMs() - started,
    });
  }

  return {
    ...answerPayload,
    cached: false,
    latency: {
      totalMs: nowMs() - started,
      retrievalMs,
      llmMs,
      cached: false,
    },
  };
}

/**
 * Streaming variant (AI2-01 streaming + V4-11 first-sentence latency).
 * Yields text deltas. Guardrail/no-data scenarios stream the composed refusal.
 */
export async function* answerQuestionStream({
  question,
  sessionId = "",
  mode: explicitMode,
  locale,
  signal,
} = {}) {
  const trimmed = String(question || "").trim();
  if (!trimmed) {
    const error = new Error("Question is required.");
    error.statusCode = 400;
    error.code = "QUESTION_REQUIRED";
    throw error;
  }

  const mode = inferMode(trimmed, explicitMode);
  const responseLocale = normalizeLocale(locale, trimmed);
  const { query } = resolveFollowUp(trimmed, sessionId);
  const preSensitive = detectSensitive(trimmed);
  const preScope = detectOutOfScope(trimmed);

  let retrieval = { results: [], intents: [], spotMatches: [] };
  if (!preSensitive.sensitive && !preScope.outOfScope) {
    try {
      retrieval = hybridSearch(query, { limit: 5, locale: responseLocale });
    } catch (error) {
      if (error.code !== "KNOWLEDGE_NOT_BUILT") {
        throw error;
      }
    }
  }

  const emotion = detectEmotion(trimmed);
  const { scenario, sensitiveCategory, otherPlace } = classifyScenario({
    question: trimmed,
    retrieval,
    emotion,
  });
  const meta = buildMeta({
    scenario,
    mode,
    question: trimmed,
    retrieval,
    extras: { sensitiveCategory, otherPlace, locale: responseLocale },
  });
  const results = scenario === "grounded" ? retrieval.results : [];
  const messages = buildMessages({
    mode,
    question: trimmed,
    results,
    history: getHistory(sessionId),
    locale: responseLocale,
  });

  let full = "";
  for await (const delta of llmStream({
    messages,
    meta,
    maxTokens: maxTokensForMode(mode),
    signal,
  })) {
    full += delta;
    yield delta;
  }

  if (sessionId) {
    const label = qualityLabel({ scenario, mode, emotion });
    appendMessage(sessionId, {
      role: "user",
      content: trimmed,
      emotionLabel: emotion,
    });
    appendMessage(sessionId, {
      role: "assistant",
      content: full,
      intentLabel: label,
      emotionLabel: emotionTag({ scenario, label, emotion }),
    });
  }
}
