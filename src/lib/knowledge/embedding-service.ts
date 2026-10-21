import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * 知识库条目向量化服务（指令 2/3 阶段 C）
 *
 * 审批通过后为条目生成 embedding，存入 knowledge_entries.embedding（vector(1536)），
 * 供后续智能匹配使用。
 *
 * 双通道（按环境变量自动选择）：
 *   1. 通用 OpenAI 兼容端点：配置 EMBEDDING_API_KEY 即启用
 *      - EMBEDDING_BASE_URL（默认 https://api.openai.com/v1）
 *      - EMBEDDING_MODEL（默认 text-embedding-3-small，1536 维，与列定义一致）
 *   2. 项目既有 Coze SDK：ENABLE_COZE_EMBEDDING === 'true' 且配置
 *      COZE_WORKLOAD_IDENTITY_API_KEY（coze-coding-dev-sdk 内部读取）
 *
 * 设计约束（#20260822-2242）：
 *   - 优雅降级：未启用/无密钥/调用失败/超时 → 返回 null，绝不阻塞审批流程
 *   - 幂等：已有 embedding 的条目直接跳过
 *   - 超时保护：20s 上限，避免外部 API 拖慢审批
 *   - 不引入新依赖：OpenAI 兼容通道使用全局 fetch
 */

const EMBEDDING_TIMEOUT = 20_000;
const MAX_INPUT_CHARS = 8000;

/** 目标向量维度（knowledge_entries.embedding 列 = vector(1536)） */
export const EMBEDDING_DIM = 1536;

/** 当前生效的模型名（用于 metadata.embedding.model） */
function currentModel(): string {
  if (process.env.EMBEDDING_API_KEY) {
    return process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  }
  return 'coze-doubao-embedding';
}

/**
 * 生成文本向量。失败/未启用一律返回 null（优雅降级，绝不抛出）。
 */
export async function generateTextEmbedding(content: string): Promise<number[] | null> {
  const text = (content || '').trim();
  if (!text) return null;

  // 方式一：通用 OpenAI 兼容端点（EMBEDDING_API_KEY 存在即启用）
  const apiKey = process.env.EMBEDDING_API_KEY;
  if (apiKey) {
    return generateViaOpenAICompatible(text, apiKey);
  }

  // 方式二：项目既有 Coze SDK
  if (process.env.ENABLE_COZE_EMBEDDING === 'true') {
    return generateViaCoze(text);
  }

  console.warn(
    '[Knowledge Embedding] 向量化未启用（配置 EMBEDDING_API_KEY 或 ENABLE_COZE_EMBEDDING=true）'
  );
  return null;
}

/** OpenAI 兼容 /embeddings 端点 */
async function generateViaOpenAICompatible(text: string, apiKey: string): Promise<number[] | null> {
  const baseUrl = (process.env.EMBEDDING_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT);
    try {
      const res = await fetch(`${baseUrl}/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input: text.slice(0, MAX_INPUT_CHARS) }),
        signal: controller.signal,
      });
      if (!res.ok) {
        console.warn(
          `[Knowledge Embedding] HTTP ${res.status}:`,
          (await res.text().catch(() => '')).slice(0, 300)
        );
        return null;
      }
      const json = await res.json();
      const vec = json?.data?.[0]?.embedding;
      return Array.isArray(vec) && vec.length > 0 ? vec : null;
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    console.warn('[Knowledge Embedding] OpenAI 兼容调用失败（已降级）:', err?.message);
    return null;
  }
}

/** Coze SDK 通道 */
async function generateViaCoze(text: string): Promise<number[] | null> {
  if (!process.env.COZE_WORKLOAD_IDENTITY_API_KEY) {
    console.warn('[Knowledge Embedding] 缺少 COZE_WORKLOAD_IDENTITY_API_KEY，跳过 Coze 向量化');
    return null;
  }
  try {
    const { EmbeddingClient } = await import('coze-coding-dev-sdk');
    const client = new EmbeddingClient();
    const timeout = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), EMBEDDING_TIMEOUT)
    );
    const embedding = await Promise.race([
      client.embedText(text.slice(0, MAX_INPUT_CHARS)),
      timeout,
    ]);
    return Array.isArray(embedding) && embedding.length > 0 ? embedding : null;
  } catch (err: any) {
    console.warn('[Knowledge Embedding] Coze 向量化失败（已降级）:', err?.message);
    return null;
  }
}

export interface EntryEmbeddingResult {
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
}

/**
 * 为条目生成并写入 embedding（幂等）。
 *
 * 状态语义：
 *   - ok：生成成功，embedding 已写入
 *   - skipped：已有 embedding / 无文本内容（reason 说明）
 *   - error：生成或写入失败（metadata.embedding 已记录原因，不影响条目状态）
 *
 * 绝不抛出异常。
 */
export async function ensureEntryEmbedding(
  db: SupabaseClient,
  entryId: string
): Promise<EntryEmbeddingResult> {
  try {
    const { data: entry, error: getErr } = await db
      .from('knowledge_entries')
      .select('content_text, embedding, metadata')
      .eq('id', entryId)
      .single();

    if (getErr || !entry) {
      console.warn('[Knowledge Embedding] 条目读取失败:', getErr?.message ?? 'not found');
      return { status: 'error', reason: getErr?.message || '条目不存在' };
    }
    if (entry.embedding) return { status: 'skipped', reason: '已有 embedding' };
    if (!entry.content_text || !entry.content_text.trim()) {
      return { status: 'skipped', reason: '无文本内容可向量化' };
    }

    // 未配置任何向量化通道 → 记为 skipped（区别于调用失败）
    const unconfigured =
      !process.env.EMBEDDING_API_KEY && process.env.ENABLE_COZE_EMBEDDING !== 'true';

    const embedding = await generateTextEmbedding(entry.content_text);
    const now = new Date().toISOString();
    const metadata = {
      ...(entry.metadata || {}),
      embedding: embedding
        ? { status: 'ok', generated_at: now, model: currentModel(), dim: embedding.length }
        : unconfigured
          ? { status: 'skipped', generated_at: now, reason: '未配置向量化服务' }
          : { status: 'error', generated_at: now, reason: '向量生成失败' },
    };

    const { error: upErr } = await db
      .from('knowledge_entries')
      .update({ embedding: embedding ?? undefined, metadata })
      .eq('id', entryId);

    if (upErr) {
      // 写入失败（如向量维度与 vector(1536) 不符）→ 回退仅写 metadata 状态
      console.warn('[Knowledge Embedding] 向量写入失败（已降级）:', upErr.message);
      try {
        await db
          .from('knowledge_entries')
          .update({
            metadata: {
              ...(entry.metadata || {}),
              embedding: { status: 'error', generated_at: now, reason: upErr.message },
            },
          })
          .eq('id', entryId);
      } catch {
        /* 回退写入失败也静默 */
      }
      return { status: 'error', reason: upErr.message };
    }

    if (embedding) return { status: 'ok' };
    return unconfigured
      ? { status: 'skipped', reason: '未配置向量化服务' }
      : { status: 'error', reason: '向量生成失败' };
  } catch (err: any) {
    console.warn('[Knowledge Embedding] 条目向量化异常（已降级）:', err?.message);
    return { status: 'error', reason: err?.message };
  }
}
