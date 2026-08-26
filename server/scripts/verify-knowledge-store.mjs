import { verifyKnowledgeStoreConsistency } from "../src/services/knowledgeRepository.mjs";

const result = verifyKnowledgeStoreConsistency();
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
