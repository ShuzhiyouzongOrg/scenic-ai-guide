/**
 * 将当前活动知识快照同步到百炼 Embedding 与 Qdrant。
 * 仅在显式配置 `RAG_REMOTE_ENABLED=true` 和全部凭据后访问外部服务。
 */
import { loadKnowledge } from "../src/services/knowledgeBuild.mjs";
import {
  buildRemoteRagConfig,
  getRemoteRagConfigIssues,
  isRemoteDenseReady
} from "../src/services/retrieval/remoteProviders.mjs";
import { syncRemoteVectorIndex } from "../src/services/retrieval/remoteIndex.mjs";

const knowledge = loadKnowledge();
if (!knowledge) {
  console.error("Knowledge base is not built. Run npm run build:knowledge first.");
  process.exitCode = 1;
} else {
  const config = buildRemoteRagConfig();
  if (!isRemoteDenseReady(config)) {
    const issues = getRemoteRagConfigIssues(config, ["shared", "embedding", "vector"]);
    console.error(`Remote RAG is not configured: ${issues.join(", ") || "RAG_REMOTE_DISABLED"}.`);
    process.exitCode = 2;
  } else {
    const result = await syncRemoteVectorIndex(knowledge, {
      config,
      onProgress(event) {
        console.log(`Synced ${event.completed}/${event.total} chunks.`);
      }
    });
    console.log(JSON.stringify(result, null, 2));
  }
}
