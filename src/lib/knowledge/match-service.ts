import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { generateTextEmbedding } from './embedding-service';

/**
 * 知识库智能匹配服务（#20260822-2242 指令 3/3）
 * 向量检索（语义） + 全文检索（关键词）多路召回 → 融合排序 → Top-N
 * 优雅降级：embedding 不可用时仅全文检索
 */

/** 语义化模块名 → knowledge_entries.type 映射 */
export const MODULE_TYPE_ALIASES: Record<string, string> = {
  product_price_lib: 'quota',
  technical_doc: 'document',
  standard_lib: 'standard',
  case_lib: 'case',
  drawing_lib: 'drawing',
  quota_lib: 'quota',
};

export interface KnowledgeMatchResult {
  id: string;
  title: string;
  type: string;
  keywords?: string[];
  summary?: string;
  file_name?: string;
  content_preview?: string;
  /** 相关性分数 0-100 */
  relevance_score: number;
  /** 命中方式：向量/全文/混合 */
  matched_by: 'vector' | 'fulltext' | 'hybrid';
}

export interface MatchKnowledgeOptions {
  query: string;
  /** 模块类型过滤（支持语义别名与原始 type 值） */
  moduleTypes?: string[];
  /** 返回条数，默认 5 */
  limit?: number;
  /** 排除指定条目 id */
  excludeId?: string;
  /** 向量检索超时（毫秒），默认 15000 */
  embeddingTimeoutMs?: number;
}

interface ScoredHit {
  vector?: number;
  text?: number;
}

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

export async function matchKnowledgeDocuments(
  options: MatchKnowledgeOptions
): Promise<KnowledgeMatchResult[]> {
  const query = (options.query || '').trim();
  if (!query) return [];

  const limit = Math.max(1, Math.min(20, options.limit || 5));
  const moduleTypes = (options.moduleTypes || [])
    .map((t) => MODULE_TYPE_ALIASES[t] || t)
    .filter(Boolean);

  const db = getSupabaseServiceClient();
  const scored = new Map<string, ScoredHit>();
  // PostgREST 对 null/空数组均视为不过滤（SQL 函数已用 cardinality 兜底）
  const filterTypes: string[] = moduleTypes.length ? moduleTypes : [];

  // ---- 1. 全文检索（始终执行，关键词命中）----
  try {
    const { data, error } = await db.rpc('search_knowledge_entries_fts', {
      query_text: query.slice(0, 200),
      match_count: limit * 2,
      filter_types: filterTypes,
    });
    if (error) {
      console.warn('[KnowledgeMatch] 全文检索失败（降级为向量/空）:', error.message || String(error));
    } else if (Array.isArray(data)) {
      for (const row of data) {
        const hit = scored.get(row.id) || {};
        hit.text = clamp(Number(row.relevance_score) || 0);
        scored.set(row.id, hit);
      }
    }
  } catch (err: any) {
    console.warn('[KnowledgeMatch] 全文检索异常:', err.message || String(err));
  }

  // ---- 2. 向量检索（embedding 可用时，语义召回）----
  let embedding: number[] | null = null;
  try {
    embedding = await generateTextEmbedding(query);
  } catch (err: any) {
    console.warn('[KnowledgeMatch] 生成查询向量失败（仅全文检索）:', err.message || String(err));
  }

  if (embedding && embedding.length > 0) {
    try {
      const { data, error } = await db.rpc('match_knowledge_entries', {
        query_embedding: embedding,
        match_count: limit * 2,
        filter_types: filterTypes,
      });
      if (error) {
        console.warn('[KnowledgeMatch] 向量检索失败:', error.message || String(error));
      } else if (Array.isArray(data)) {
        for (const row of data) {
          const hit = scored.get(row.id) || {};
          hit.vector = clamp(Number(row.relevance_score) || 0);
          scored.set(row.id, hit);
        }
      }
    } catch (err: any) {
      console.warn('[KnowledgeMatch] 向量检索异常:', err.message || String(err));
    }
  }

  if (scored.size === 0) return [];

  // ---- 3. 拉取条目详情 ----
  const ids = Array.from(scored.keys());
  if (options.excludeId) {
    const idx = ids.indexOf(options.excludeId);
    if (idx >= 0) ids.splice(idx, 1);
  }
  if (ids.length === 0) return [];

  let items: any[] = [];
  try {
    const { data, error } = await db
      .from('knowledge_entries')
      .select('id,title,type,keywords,summary,file_name,metadata,content_text')
      .in('id', ids)
      .limit(ids.length);
    if (error) {
      console.warn('[KnowledgeMatch] 拉取条目失败:', error.message || String(error));
    } else {
      items = data || [];
    }
  } catch (err: any) {
    console.warn('[KnowledgeMatch] 拉取条目异常:', err.message || String(err));
  }

  const byId = new Map(items.map((it) => [it.id, it]));

  // ---- 4. 融合排序：vector*0.6 + text*0.4 ----
  const results: KnowledgeMatchResult[] = [];
  for (const [id, hit] of scored.entries()) {
    const item = byId.get(id);
    if (!item) continue;
    const v = hit.vector;
    const t = hit.text;
    const hasVector = v != null;
    const hasText = t != null;
    const score =
      hasVector && hasText
        ? Math.round(v! * 0.6 + t! * 0.4)
        : Math.round(v ?? t ?? 0);
    // #[20260827-2000]-1：file_name 存储的是时间戳格式存储名，原始文件名在 metadata.original_file_name，优先取后者
    const originalFileName = String(item?.metadata?.original_file_name || '');
    results.push({
      id,
      title: item.title || originalFileName || item.file_name || '未命名文档',
      type: item.type || 'document',
      keywords: Array.isArray(item.keywords) ? item.keywords : undefined,
      summary: item.summary || undefined,
      file_name: originalFileName || item.file_name || undefined,
      content_preview: (item.content_text || '').slice(0, 200) || undefined,
      relevance_score: clamp(score),
      matched_by: hasVector && hasText ? 'hybrid' : hasVector ? 'vector' : 'fulltext',
    });
  }

  results.sort((a, b) => b.relevance_score - a.relevance_score);
  return results.slice(0, limit);
}

// ---------------------------------------------------------------------------
// 资料中心资产精确匹配（#[20260827-1430]：知识检索优先匹配资料中心已有文件）
// ---------------------------------------------------------------------------

/** 资料中心匹配结果（来自 knowledge_assets 视图，仅 approved） */
export interface KnowledgeAssetMatch {
  id: string;
  title: string;
  /** 资料类型：standard/document/case/drawing/quota */
  type: string;
  /** 文件 MIME 类型 */
  file_type?: string;
  summary?: string;
  keywords?: string[];
  storage_path?: string;
  storage_bucket?: string;
  /** 命中的关键词 */
  matchedKeys: string[];
  /** 匹配得分（>=2 才返回） */
  score: number;
  /** 是否命中标准编号（如 GB 3838-2002） */
  codeMatched: boolean;
}

/** PostgREST ILIKE 特殊字符转义 */
function escapeLike(s: string): string {
  return s.replace(/[\\%_*]/g, (m) => '\\' + m);
}

/** 资料中心匹配关键词（带权重，#[20260827-1430]-1 增强） */
export interface AssetKeyword {
  /** 关键词文本 */
  text: string;
  /**
   * 匹配权重：
   * - 4：标准编号变体 / 完整中文长词（强相关，单独命中即可返回）
   * - 2：剥离类型词后的核心主题词（如 "地表水排放标准" → "地表水"）/ 纯数字编号
   * - 1：2-3 字滑动窗口子词（弱相关，需多个命中组合）
   */
  weight: number;
  /** 是否标准编号形态（GB 3838 / 3838） */
  isCode?: boolean;
}

/** 中文停词（疑问/语气/动作词，从连续词中剥离） */
const ZH_STOP_RE =
  /什么|如何|怎样|怎么|为什么|为啥|为何|有没有|哪些|哪个|请问|帮我|介绍|说明|请问一下|我|想|要|给|是|的|吗|呢|啊|吧|呀/g;

/** 标准/规范/法规类常见尾部词（剥离后得到核心主题词，如 "地表水排放标准" → "地表水"） */
const TAIL_WORDS = [
  '污染物排放标准',
  '环境质量标准',
  '排放标准',
  '质量标准',
  '水质标准',
  '技术规范',
  '技术标准',
  '国家标准',
  '行业标准',
  '地方标准',
  '执行标准',
  '卫生标准',
  '安全标准',
  '产品标准',
  '评价标准',
  '设计规范',
  '设计标准',
  '验收标准',
  '控制标准',
  '监测标准',
  '标准',
  '规范',
  '规程',
  '导则',
  '要求',
  '规定',
  '准则',
  '办法',
  '细则',
  '指南',
  '条例',
  '政策',
  '法规',
];

/** 生成 [minLen, maxLen] 长度的滑动窗口子串（用于标题中插入词的场景，如 "屠宰与肉类加工废水"） */
function slidingWindows(s: string, minLen = 2, maxLen = 3): string[] {
  const out: string[] = [];
  const max = Math.min(maxLen, s.length);
  for (let len = max; len >= minLen; len--) {
    for (let i = 0; i + len <= s.length; i++) {
      out.push(s.slice(i, i + len));
    }
  }
  return out;
}

/** 剥离常见尾部类型词，提取核心主题词 */
function stripTailWords(clean: string): string[] {
  const cores: string[] = [];
  for (const w of TAIL_WORDS) {
    if (clean.length > w.length && clean.endsWith(w)) {
      cores.push(clean.slice(0, clean.length - w.length));
    }
  }
  return cores;
}

/**
 * 从查询文本提取资料中心匹配关键词（#[20260827-1430]-1 增强）
 * 三级权重策略：
 * 1. 标准编号变体（GB 3838-2002 / GB3838 / HJ/T 91-2002 等）→ weight 4
 * 2. 中文连续词：
 *    - 完整长词（"地表水排放标准"）→ weight 4
 *    - 剥离尾部类型词后的核心主题词（"地表水"）→ weight 2
 *    - 2-3 字滑动窗口子词（"地表"、"标准" 等）→ weight 1
 * 3. 纯数字编号（3838 / 2002）→ weight 2
 */
export function extractAssetKeywords(query: string): AssetKeyword[] {
  const q = (query || '').trim();
  if (!q) return [];
  const keys: AssetKeyword[] = [];
  const seen = new Set<string>();

  const push = (text: string, weight: number, isCode = false) => {
    const t = (text || '').trim();
    if (!t || seen.has(t)) return;
    if (t.length === 1) return;
    // 过滤纯停词/无语义短词
    if (/^(什么|如何|怎样|怎么|为什么|为啥|为何|有没有|哪些|哪个|请问|帮我|介绍|说明|的吗呢啊吧呀)$/.test(t)) return;
    seen.add(t);
    keys.push({ text: t, weight, isCode });
  };

  // 1. 标准编号（含变体，便于 ILIKE 命中全角/半角破折号、空格差异）
  //    例如 "GB 3838-2002" → GB3838-2002 / GB 3838-2002 / GB3838 / GB 3838
  //         以及全角版本 GB3838－2002 / GB 3838－2002 / GB3838－ / GB 3838－
  const codeRe = /[A-Za-z]{1,4}\s*[-／/]?\s*\d{2,5}(?:\s*[-–—－]\s*\d{4})?/g;
  const codes = q.match(codeRe) || [];
  for (const c of codes) {
    const variants = new Set<string>();
    const norm = c.replace(/\s+/g, '');
    variants.add(norm); // GB3838-2002
    variants.add(c.trim()); // GB 3838-2002
    const base = norm.replace(/[-–—－].*$/, ''); // GB3838（去年份及破折号）
    if (base !== norm) variants.add(base);
    const baseSpace = c.trim().replace(/[-–—－].*$/, '');
    if (baseSpace !== c.trim()) variants.add(baseSpace); // GB 3838
    // 半角 ↔ 全角破折号互换（标题可能用全角 －）
    for (const v of [...variants]) {
      if (v.includes('-')) variants.add(v.replace(/-/g, '－'));
      if (v.includes('－')) variants.add(v.replace(/－/g, '-'));
    }
    variants.forEach((v) => push(v, 4, true));
  }

  // 2. 纯数字编号（如 3838 / 2002，作为弱编号关键词）
  const numRe = /\b\d{3,5}\b/g;
  for (const n of q.match(numRe) || []) {
    push(n, 2, true);
  }

  // 3. 中文连续词（2-12 字）：长词(4) + 核心主题词(2) + 2-3 字窗口子词(1)
  const zhRe = /[\u4e00-\u9fa5]{2,12}/g;
  for (const z of q.match(zhRe) || []) {
    const clean = z.replace(ZH_STOP_RE, '').trim();
    if (clean.length < 2) continue;
    push(clean, 4); // 完整长词（强相关）
    // 剥离尾部类型词 → 核心主题词
    for (const core of stripTailWords(clean)) {
      if (core.length >= 2) push(core, 2);
    }
    // 2-3 字滑动窗口子词（弱相关，覆盖标题中插词的场景）
    if (clean.length > 3) {
      for (const w of slidingWindows(clean, 2, 3)) {
        push(w, 1);
      }
    }
  }

  // 控制总关键词数，避免 PostgREST or 条件过长
  return keys.slice(0, 18);
}

/**
 * 匹配资料中心已有资产（knowledge_assets 视图，仅 approved，#[20260827-1430]-1 增强）
 * - SQL 预筛选：关键词命中 标题 / metadata.standard_code / metadata.file_name / metadata.original_name 即拉回候选
 * - 内存评分：Σ 命中关键词权重 + 多关键词命中加成 + 标准编号额外加权，>=3 才返回，取 Top-N
 */
export async function matchKnowledgeAssets(
  query: string,
  opts?: { limit?: number }
): Promise<KnowledgeAssetMatch[]> {
  const q = (query || '').trim();
  if (!q) return [];
  const keys = extractAssetKeywords(q);
  if (keys.length === 0) return [];
  const limit = Math.max(1, Math.min(5, opts?.limit || 3));

  const db = getSupabaseServiceClient();

  // OR 条件：任一关键词命中 title / standard_code / file_name / original_name（内存中再精确评分）
  const orParts = keys.map(
    (k) =>
      `title.ilike.*${escapeLike(k.text)}*,metadata->>standard_code.ilike.*${escapeLike(k.text)}*,` +
      `metadata->>file_name.ilike.*${escapeLike(k.text)}*,metadata->>original_name.ilike.*${escapeLike(k.text)}*`
  );

  let rows: any[] = [];
  try {
    const { data, error } = await db
      .from('knowledge_assets')
      .select('id,title,category,source,keywords,summary,metadata,storage_path,storage_bucket,is_public')
      .eq('is_public', true)
      .or(orParts.join(','))
      .limit(50);
    if (error) {
      console.warn('[KnowledgeMatch] 资料中心资产匹配失败:', error.message || String(error));
      return [];
    }
    rows = data || [];
  } catch (err: any) {
    console.warn('[KnowledgeMatch] 资料中心资产匹配异常:', err?.message || String(err));
    return [];
  }
  console.log(
    `[KnowledgeMatch] 资料中心匹配 query="${q}" keys=[${keys.map((k) => `${k.text}(${k.weight})`).join(', ')}] 候选=${rows.length}`
  );

  const matches: KnowledgeAssetMatch[] = [];
  for (const row of rows) {
    const title: string = row?.title || '';
    const meta: Record<string, unknown> =
      row?.metadata && typeof row.metadata === 'object' ? row.metadata : {};
    const codeField = String(meta?.standard_code || '');
    const fileName = String(meta?.file_name || meta?.original_name || '');
    const summary = String(row?.summary || '');
    const kwList = Array.isArray(row?.keywords) ? (row.keywords as string[]) : [];

    let score = 0;
    let codeHit = false;
    const matchedKeys: string[] = [];
    let hitCount = 0;
    for (const k of keys) {
      const kLower = k.text.toLowerCase();
      const hit =
        title.toLowerCase().includes(kLower) ||
        codeField.toLowerCase().includes(kLower) ||
        fileName.toLowerCase().includes(kLower) ||
        summary.toLowerCase().includes(kLower) ||
        kwList.some((kw) => String(kw).toLowerCase().includes(kLower));
      if (hit) {
        score += k.weight;
        hitCount++;
        matchedKeys.push(k.text);
        if (k.isCode) codeHit = true;
      }
    }
    if (hitCount === 0) continue;
    // 多关键词命中加成：每多命中 1 个 +1（弱子词组合也能达到阈值）
    if (hitCount >= 2) score += hitCount - 1;
    // 标准编号命中额外加权
    if (codeHit) score += 2;
    // 阈值：>=3 才返回（单个通用子词如"标准"命中仅 1 分，避免误报）
    if (score < 3) continue;

    matches.push({
      id: row.id,
      title,
      type: row.category || 'document',
      file_type: row.source || undefined,
      summary: row.summary || undefined,
      keywords: kwList,
      storage_path: row.storage_path || undefined,
      storage_bucket: row.storage_bucket || undefined,
      matchedKeys,
      score,
      codeMatched: codeHit,
    });
  }

  matches.sort((a, b) => b.score - a.score || (b.codeMatched ? 1 : 0) - (a.codeMatched ? 1 : 0));
  const top = matches.slice(0, limit);
  if (top.length > 0) {
    console.log(
      `[KnowledgeMatch] 资料中心匹配结果: ${top.map((m) => `${m.title}(${m.score}${m.codeMatched ? ',编号' : ''})`).join(' | ')}`
    );
  } else {
    console.log(`[KnowledgeMatch] 资料中心匹配结果: 无匹配`);
  }
  return top;
}

/**
 * 资料中心资产匹配（兼容别名，#[20260827-1430]-1）
 * 知识问答链路统一入口，供 chat 路由/处理器调用。
 */
export const searchKnowledgeWithAssetMatch = matchKnowledgeAssets;
