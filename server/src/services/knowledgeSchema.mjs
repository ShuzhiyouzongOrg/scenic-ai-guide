/**
 * @fileoverview 活动知识快照的 JSON Schema 定义与轻量一致性校验器。
 */
import { ACCESS_SCOPES, KNOWLEDGE_SCOPES } from "./knowledgeMetadata.mjs";

/** @type {object} 知识分块可序列化结构约束。 */
export const knowledgeChunkJsonSchema = Object.freeze({
  $id: "cn.shuzhiyouzong.knowledge-chunk.v1",
  type: "object",
  required: [
    "id", "documentId", "title", "content", "source", "language", "documentType",
    "knowledgeScope", "accessScope", "tenantId", "enabled", "indexVersion", "contentHash"
  ],
  properties: {
    id: { type: "string", minLength: 1 },
    documentId: { type: "string", minLength: 1 },
    parentId: { type: ["string", "null"] },
    title: { type: "string" },
    content: { type: "string", minLength: 1 },
    source: { type: "string", minLength: 1 },
    language: { type: "string", minLength: 1 },
    documentType: { type: "string", minLength: 1 },
    knowledgeScope: { enum: [...KNOWLEDGE_SCOPES] },
    accessScope: { enum: [...ACCESS_SCOPES] },
    tenantId: { type: "string", minLength: 1 },
    enabled: { type: "boolean" },
    indexVersion: { type: "string", minLength: 1 },
    contentHash: { type: ["string", "null"] }
  }
});

/**
 * 校验所有分块必填字段、枚举、来源文档和版本一致性。
 * @param {object} knowledge 活动知识快照。
 * @returns {{ok: boolean, checked: number, errors: string[]}} 校验结果。
 */
export function validateKnowledgeSnapshotMetadata(knowledge) {
  const errors = [];
  const documents = new Map((knowledge?.documents || []).map((document) => [document.id, document]));
  const chunks = Array.isArray(knowledge?.chunks) ? knowledge.chunks : [];
  if (!knowledge?.indexVersion) errors.push("indexVersion:required");
  for (const chunk of chunks) {
    const prefix = `chunk:${chunk?.id || "unknown"}`;
    for (const field of knowledgeChunkJsonSchema.required) {
      if (chunk?.[field] === undefined || chunk?.[field] === "") errors.push(`${prefix}:${field}:required`);
    }
    if (!KNOWLEDGE_SCOPES.has(chunk?.knowledgeScope)) errors.push(`${prefix}:knowledgeScope:invalid`);
    if (!ACCESS_SCOPES.has(chunk?.accessScope)) errors.push(`${prefix}:accessScope:invalid`);
    if (!documents.has(chunk?.documentId)) errors.push(`${prefix}:documentId:not_found`);
    const document = documents.get(chunk?.documentId);
    if (document && chunk.source !== document.fileName) errors.push(`${prefix}:source:mismatch`);
    if (chunk?.indexVersion !== knowledge?.indexVersion) errors.push(`${prefix}:indexVersion:mismatch`);
    if (document && (chunk.tenantId || "default") !== (document.tenantId || "default")) {
      errors.push(`${prefix}:tenantId:mismatch`);
    }
    if (document && chunk.accessScope !== document.accessScope) errors.push(`${prefix}:accessScope:mismatch`);
  }
  return { ok: errors.length === 0, checked: chunks.length, errors };
}
