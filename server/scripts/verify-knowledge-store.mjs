/**
 * @fileoverview 知识存储一致性验证脚本。
 * @description 比较活动知识快照、元数据与索引状态，并以进程退出码反映检查结果。
 */
import { verifyKnowledgeStoreConsistency } from "../src/services/knowledgeRepository.mjs";

const result = verifyKnowledgeStoreConsistency();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
