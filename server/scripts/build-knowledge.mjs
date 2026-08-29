/**
 * @fileoverview 景区知识快照构建脚本。
 * @description 调用知识构建服务生成结构化文档、景点、导览章节与检索分块，并输出构建摘要。
 */
import { buildKnowledge } from "../src/services/knowledgeBuild.mjs";

const sourceDir = process.argv[2];
const result = buildKnowledge(sourceDir ? { sourceDir } : {});

console.log(
  JSON.stringify(
    {
      generatedAt: result.generatedAt,
      documents: result.documents.length,
      spots: result.spots.length,
      guideSections: result.guideSections.length,
      chunks: result.chunks.length
    },
    null,
    2
  )
);
