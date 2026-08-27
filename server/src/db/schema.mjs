/**
 * @fileoverview 面向 `/api/schema` 和项目文档的领域数据表说明。
 *
 * 此对象不是建表 SQL；实际迁移定义位于 `database.mjs`。它为前端和维护人员提供稳定、
 * 可序列化的表用途与核心列概览。
 */

/**
 * 领域表结构说明映射。
 *
 * @type {Record<string, {description: string, columns: Record<string, string>}>}
 * @example
 * import { schema } from "./schema.mjs";
 * console.log(schema.messages.columns.session_id);
 */
export const schema = {
  adminUsers: {
    description: "Admin and operator accounts.",
    columns: {
      id: "text primary key",
      username: "text unique not null",
      password_hash: "text not null",
      role: "text not null",
      created_at: "datetime not null"
    }
  },
  visitorSessions: {
    description: "Anonymous visitor sessions.",
    columns: {
      id: "text primary key",
      started_at: "datetime not null",
      ended_at: "datetime",
      channel: "text",
      satisfaction_score: "integer"
    }
  },
  messages: {
    description: "Visitor and digital-human conversation messages.",
    columns: {
      id: "text primary key",
      session_id: "text not null",
      role: "text not null",
      content: "text not null",
      intent_label: "text",
      emotion_label: "text",
      latency_ms: "integer",
      created_at: "datetime not null"
    }
  },
  knowledgeDocuments: {
    description: "Uploaded source documents.",
    columns: {
      id: "text primary key",
      file_name: "text not null",
      file_type: "text not null",
      status: "text not null",
      processing_stage: "text not null",
      knowledge_scope: "text not null",
      access_scope: "public, authenticated, admin or internal",
      tenant_id: "text not null",
      scenic_area: "text",
      language: "text",
      document_type: "text",
      valid_from: "datetime",
      valid_to: "datetime",
      enabled: "boolean",
      error_code: "text",
      error_message: "text",
      attempt_count: "integer",
      started_at: "datetime",
      finished_at: "datetime",
      index_version: "text",
      chunk_count: "integer default 0",
      created_at: "datetime not null"
    }
  },
  knowledgeProcessingTasks: {
    description: "Restartable asynchronous document parsing tasks.",
    columns: {
      id: "text primary key",
      document_id: "text not null",
      task_type: "text not null",
      content_hash: "text not null",
      status: "text not null",
      external_job_id: "text",
      attempts: "integer not null",
      next_attempt_at: "datetime not null",
      lease_until: "datetime",
      last_error_code: "text",
      result_metadata: "json",
      created_at: "datetime not null",
      updated_at: "datetime not null"
    }
  },
  knowledgeChunks: {
    description: "RAG-ready chunks with retrieval metadata.",
    columns: {
      id: "text primary key",
      document_id: "text not null",
      scenic_spot_id: "text",
      title: "text",
      content: "text not null",
      keywords: "json",
      parent_id: "text",
      section_path: "text",
      page: "integer",
      sheet_name: "text",
      cell_range: "text",
      row_start: "integer",
      row_end: "integer",
      knowledge_scope: "text",
      access_scope: "public, authenticated, admin or internal",
      tenant_id: "text",
      scenic_area: "text",
      language: "text",
      document_type: "text",
      valid_from: "datetime",
      valid_to: "datetime",
      enabled: "boolean",
      index_version: "text",
      content_hash: "text",
      embedding_ref: "text",
      created_at: "datetime not null"
    }
  },
  knowledgeIndexVersions: {
    description: "Validated knowledge snapshot versions and active pointer history.",
    columns: {
      index_version: "text primary key",
      chunker_version: "text not null",
      generated_at: "datetime not null",
      document_count: "integer",
      chunk_count: "integer",
      active: "boolean"
    }
  },
  ragEmbeddingCache: {
    description: "Reusable Dense Embedding vectors keyed by model, dimensions and contextual content hash.",
    columns: {
      cache_key: "text primary key",
      model: "text not null",
      dimensions: "integer not null",
      content_hash: "text not null",
      vector_json: "json not null",
      created_at: "datetime not null",
      last_used_at: "datetime not null"
    }
  },
  knowledgeGaps: {
    description: "Aggregated low-relevance, unanswered and low-satisfaction questions pending human review.",
    columns: {
      id: "text primary key",
      question_hash: "text not null",
      question_preview: "text not null",
      scenic_area: "text not null",
      intent: "text not null",
      reasons: "json not null",
      sources: "json not null",
      occurrence_count: "integer not null",
      status: "pending, confirmed or dismissed",
      first_seen_at: "datetime not null",
      last_seen_at: "datetime not null",
      confirmed_at: "datetime",
      dismissed_at: "datetime"
    }
  },
  ragExperimentState: {
    description: "RAG retrieval experiment status and automatic rollback state.",
    columns: {
      experiment_id: "text primary key",
      status: "active or rolled_back",
      rollback_reason: "text",
      started_at: "datetime not null",
      updated_at: "datetime not null",
      rolled_back_at: "datetime"
    }
  },
  ragExperimentEvents: {
    description: "Anonymous answer, feedback, citation, latency and cost metrics for RAG variants.",
    columns: {
      id: "text primary key",
      experiment_id: "text not null",
      session_hash: "irreversible text hash",
      message_id: "text",
      variant: "control or treatment",
      scenario: "text",
      refused: "boolean",
      accepted: "nullable boolean",
      citation_clicked: "boolean",
      latency_ms: "real",
      input_tokens: "integer",
      output_tokens: "integer",
      embedding_tokens: "integer",
      estimated_cost_usd: "real",
      model: "text",
      index_version: "text",
      created_at: "datetime not null"
    }
  },
  adminAuditLogs: {
    description: "Security audit trail for privileged knowledge mutations.",
    columns: {
      id: "text primary key",
      actor_id: "text",
      actor_role: "text",
      action: "text not null",
      target_type: "text",
      target_id: "text",
      status: "success, rejected or failed",
      details: "sanitized json",
      created_at: "datetime not null"
    }
  },
  scenicSpots: {
    description: "Structured Lingshan scenic spot records.",
    columns: {
      id: "text primary key",
      name: "text not null",
      aliases: "json",
      location_text: "text",
      parameters: "text",
      core_function: "text",
      culture: "text",
      detail: "text",
      highlights: "text",
      open_info: "text",
      notes: "text"
    }
  },
  routes: {
    description: "Personalized tour route definitions and selections.",
    columns: {
      id: "text primary key",
      name: "text not null",
      route_type: "text not null",
      duration_minutes: "integer",
      node_ids: "json not null",
      tags: "json",
      created_at: "datetime not null"
    }
  },
  digitalHumanConfigs: {
    description: "Digital human image, voice and behavior settings.",
    columns: {
      id: "text primary key",
      name: "text not null",
      character_asset: "text",
      voice_id: "text",
      speech_rate: "real",
      welcome_text: "text",
      emotion_style: "text",
      enabled: "boolean default false"
    }
  },
  feedback: {
    description: "Visitor ratings and text feedback.",
    columns: {
      id: "text primary key",
      session_id: "text not null",
      score: "integer",
      sentiment: "text",
      content: "text",
      created_at: "datetime not null"
    }
  },
  touristBehavior: {
    description: "Official Excel behavior and consumption analysis data.",
    columns: {
      id: "text primary key",
      tourist_id: "text",
      age: "integer",
      gender: "text",
      attraction_name: "text",
      visit_date: "date",
      stay_duration: "real",
      ticket_cost: "real",
      food_cost: "real",
      shopping_cost: "real",
      transport_cost: "real",
      entertainment_cost: "real",
      total_cost: "real",
      group_size: "integer",
      satisfaction: "integer"
    }
  },
  webVitalEvents: {
    description: "Anonymous browser performance metrics for version-level P75 reporting.",
    columns: {
      id: "integer primary key",
      metric: "CLS, FCP, INP, LCP or TTFB",
      value: "real not null",
      rating: "good, needs-improvement or poor",
      app_version: "text not null",
      device_class: "mobile or desktop",
      created_at: "datetime not null"
    }
  }
};
