/**
 * 价格解析器（#[20260827-1030]-7）
 *
 * 统一价格查询优先级（用户确认的决策链路）：
 *   1️⃣ 产品价格库（product_prices，用户自建/历史成交价）→ 最优先，真实可靠
 *   2️⃣ 定额库（quota_prices，国家/行业规范定额价格）→ 次优先，有规范依据
 *   3️⃣ 联网搜索（实时市场价）→ 备选，获取最新行情
 *   4️⃣ 规则估算（内置经验值）→ 兜底，标注"估算价，待核实"
 *
 * 环境变量：
 *   PRICE_PRIORITY=product_db_first | quota_first | mixed
 *   ENABLE_ONLINE_SEARCH=true|false
 *   ONLINE_SEARCH_PROVIDER=coze | web-search | auto（当前统一走 searchWeb 多供应商链路）
 *   ENABLE_DATA_SOURCE_TRACKING=true|false
 */
import { searchProductPrice, type ProductPriceRow } from './product-price-service';
import { searchQuotaPrice, type QuotaPriceRow } from './quota-price-service';
import { searchWeb } from '@/lib/web-search';

export type PriceSource = 'product_db' | 'quota_db' | 'online_search' | 'rule_estimate';
export type PriceConfidence = 'high' | 'medium' | 'low' | 'estimate';

export interface PriceResult {
  productName: string;
  model?: string;
  spec?: string;
  price: number;
  unit: string;
  source: PriceSource;
  /** 具体来源描述（展示用） */
  sourceDetail: string;
  confidence: PriceConfidence;
  /** 命中的原始数据（匹配依据） */
  matchedFrom?: string;
  /** 原始记录 ID（回写/溯源用） */
  recordId?: number;
}

export interface ResolvePriceOptions {
  userId?: string;
  enableOnlineSearch?: boolean;
  /** 全部链路失败时是否回退规则估算（默认 true） */
  fallbackToEstimate?: boolean;
  /** 规则估算兜底价 */
  fallbackPrice?: number;
  /** 规则估算兜底说明 */
  fallbackDetail?: string;
  /** 单条联网搜索超时（默认 12s） */
  onlineTimeoutMs?: number;
}

// ---------------------------------------------------------------------------
// 配置读取
// ---------------------------------------------------------------------------

export type PricePriority = 'product_db_first' | 'quota_first' | 'mixed';

export function getPricePriority(): PricePriority {
  const v = (process.env.PRICE_PRIORITY || 'product_db_first').trim().toLowerCase();
  if (v === 'quota_first') return 'quota_first';
  if (v === 'mixed') return 'mixed';
  return 'product_db_first';
}

export function isOnlineSearchEnabled(): boolean {
  return (process.env.ENABLE_ONLINE_SEARCH || 'true').trim().toLowerCase() !== 'false';
}

export function isDataSourceTrackingEnabled(): boolean {
  return (process.env.ENABLE_DATA_SOURCE_TRACKING || 'true').trim().toLowerCase() !== 'false';
}

// ---------------------------------------------------------------------------
// 价格来源标注文案
// ---------------------------------------------------------------------------

export function priceSourceLabel(source: PriceSource): string {
  switch (source) {
    case 'product_db':
      return '产品价格库';
    case 'quota_db':
      return '定额库';
    case 'online_search':
      return '联网搜索';
    case 'rule_estimate':
      return '规则估算';
  }
}

// ---------------------------------------------------------------------------
// 联网搜索价格提取
// ---------------------------------------------------------------------------

/** 从搜索文本中提取设备价格（支持 万元/元），并做合理性过滤 */
export function parseOnlinePrice(text: string): number | null {
  if (!text) return null;
  let best: number | null = null;
  const patterns = [
    /(\d+(?:\.\d+)?)\s*万元/g,
    /(\d+(?:\.\d+)?)\s*元(?:\s*[／/]\s*(?:台|套|个|项))?/g,
    /(?:价格|报价|单价)[：:]\s*(\d+(?:\.\d+)?)\s*(万元?|元)?/g,
  ];
  for (const re of patterns) {
    for (const m of text.matchAll(re)) {
      const val = parseFloat(m[1]);
      const isWan = m[0].includes('万') || m[2] === '万' || m[2] === '万元';
      const price = isWan ? val * 10000 : val;
      // 设备单价合理性区间：500 ~ 5,000,000 元
      if (price >= 500 && price <= 5000000) {
        if (best === null || price > best) best = price;
      }
    }
  }
  return best;
}

// 在线搜索内存缓存（按 设备名+规格 缓存，避免重复检索）
const onlinePriceCache = new Map<string, PriceResult | null>();

async function searchOnlinePrice(
  productName: string,
  spec?: string,
  timeoutMs = 12000
): Promise<PriceResult | null> {
  const cacheKey = `${productName}|${spec || ''}`;
  if (onlinePriceCache.has(cacheKey)) return onlinePriceCache.get(cacheKey)!;

  const query = `${productName}${spec ? ' ' + spec : ''} 价格 元 单价`;
  const result = await Promise.race([
    searchWeb(query).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
  ]);

  if (!result) {
    onlinePriceCache.set(cacheKey, null);
    return null;
  }
  const text = [result.abstract, ...result.items.map((i) => i.snippet || '')].join('\n');
  const price = parseOnlinePrice(text);
  if (price === null) {
    onlinePriceCache.set(cacheKey, null);
    return null;
  }
  const hit: PriceResult = {
    productName,
    spec,
    price,
    unit: '台',
    source: 'online_search',
    sourceDetail: '联网搜索（实时市场行情）',
    confidence: 'low',
    matchedFrom: text.slice(0, 120).replace(/\n/g, ' '),
  };
  onlinePriceCache.set(cacheKey, hit);
  return hit;
}

// ---------------------------------------------------------------------------
// 单条价格解析（核心决策链路）
// ---------------------------------------------------------------------------

export async function resolvePrice(
  productName: string,
  spec?: string,
  options?: ResolvePriceOptions
): Promise<PriceResult> {
  const priority = getPricePriority();
  const userId = options?.userId;

  // 1. 产品价格库（最高优先） + 2. 定额库 —— 两条 DB 查询
  const [productRow, quotaRow] = await Promise.all([
    searchProductPrice(productName, spec, userId),
    searchQuotaPrice(productName, spec),
  ]);

  const dbPairs: Array<[PriceSource, ProductPriceRow | QuotaPriceRow | null]> =
    priority === 'quota_first'
      ? [
          ['quota_db', quotaRow],
          ['product_db', productRow],
        ]
      : [
          ['product_db', productRow],
          ['quota_db', quotaRow],
        ];
  // mixed 模式：两者都查，优先产品库（用户自建最真实）
  if (priority === 'mixed') {
    const found: PriceResult | null = productRow
      ? rowToPriceResult(productName, spec, 'product_db', productRow, userId)
      : quotaRow
        ? rowToPriceResult(productName, spec, 'quota_db', quotaRow, userId)
        : null;
    if (found) return found;
  } else {
    for (const [source, row] of dbPairs) {
      if (row) return rowToPriceResult(productName, spec, source, row, userId);
    }
  }

  // 3. 联网搜索（备选，按开关）
  const useOnline = options?.enableOnlineSearch ?? isOnlineSearchEnabled();
  if (useOnline) {
    const online = await searchOnlinePrice(productName, spec, options?.onlineTimeoutMs);
    if (online) return online;
  }

  // 4. 规则估算（兜底）
  if (options?.fallbackToEstimate !== false) {
    return {
      productName,
      spec,
      price: options?.fallbackPrice ?? 0,
      unit: '项',
      source: 'rule_estimate',
      sourceDetail: options?.fallbackDetail || '规则估算（建议补充产品价格库核实）',
      confidence: 'estimate',
    };
  }

  // 完全无数据
  return {
    productName,
    spec,
    price: 0,
    unit: '项',
    source: 'rule_estimate',
    sourceDetail: '暂无数据，请补充产品价格库',
    confidence: 'estimate',
  };
}

function rowToPriceResult(
  productName: string,
  spec: string | undefined,
  source: PriceSource,
  row: ProductPriceRow | QuotaPriceRow,
  userId?: string
): PriceResult {
  if (source === 'product_db') {
    const r = row as ProductPriceRow;
    return {
      productName: r.product_name || productName,
      model: r.model ?? undefined,
      spec: r.spec ?? spec,
      price: Number(r.price),
      unit: r.unit || '台',
      source,
      sourceDetail: `产品价格库（${r.product_name}${r.model ? ' ' + r.model : ''}${
        r.source ? '，' + r.source : ''
      }，${r.price_date || ''}）`,
      confidence: 'high',
      matchedFrom: r.remark ?? undefined,
      recordId: r.id,
    };
  }
  const r = row as QuotaPriceRow;
  return {
    productName: r.product_name || productName,
    model: r.model ?? undefined,
    spec: r.spec ?? spec,
    price: Number(r.price),
    unit: r.unit || '台',
    source,
    sourceDetail: `定额库（${r.standard_name || '国家定额'} ${r.quota_year || ''}年，编号 ${r.quota_code}）`,
    confidence: 'medium',
    matchedFrom: r.remark ?? undefined,
    recordId: r.id,
  };
}

// ---------------------------------------------------------------------------
// 设备清单批量价格富集
// ---------------------------------------------------------------------------

export interface PriceEnrichableItem {
  name: string;
  model?: string;
  specs?: string;
  unitPrice: number;
  priceSource?: string;
  priceDetail?: string;
  remark?: string;
  quantity?: number;
  powerKw?: number;
}

export interface ResolveEquipmentOptions extends ResolvePriceOptions {
  /** 联网搜索仅针对 DB 未命中的条目，总体超时（默认 12s） */
  onlineBatchTimeoutMs?: number;
}

/**
 * 对设备清单逐项执行价格决策链路：
 * 产品库/定额库有命中 → 覆盖规则价并标注来源；
 * 未命中且开启联网 → 联网检索（有解析出价格才覆盖）；
 * 否则保留规则估算价并标注"估算价，待核实"。
 */
export async function resolveEquipmentPrices<T extends PriceEnrichableItem>(
  items: T[],
  options?: ResolveEquipmentOptions
): Promise<T[]> {
  if (!items || items.length === 0) return items;

  const userId = options?.userId;
  const useOnline = options?.enableOnlineSearch ?? isOnlineSearchEnabled();

  // 第一轮：DB 查询（产品库 + 定额库，并行）
  const dbResults = await Promise.all(
    items.map(async (item) => {
      const spec = (item.specs as string) || undefined;
      const resolved = await resolvePrice(item.name, spec, {
        userId,
        enableOnlineSearch: false,
        fallbackToEstimate: false,
      });
      return resolved.source === 'product_db' || resolved.source === 'quota_db' ? resolved : null;
    })
  );

  // 第二轮：DB 未命中的条目 → 联网搜索（并行，总体超时）
  const onlineResults = new Map<number, PriceResult | null>();
  if (useOnline) {
    const missIndexes = dbResults.map((r, i) => (r ? -1 : i)).filter((i) => i >= 0);
    const overall = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), options?.onlineBatchTimeoutMs ?? 12000)
    );
    const searches = Promise.all(
      missIndexes.map(async (i) => {
        const item = items[i];
        const spec = (item.specs as string) || undefined;
        const hit = await searchOnlinePrice(item.name, spec, 8000);
        onlineResults.set(i, hit);
      })
    );
    await Promise.race([searches, overall]);
  }

  // 组装结果
  return items.map((item, i) => {
    const dbHit = dbResults[i];
    const onlineHit = onlineResults.get(i) ?? null;
    const hit = dbHit ?? onlineHit;

    if (!hit) {
      // 兜底：保留规则估算价
      return {
        ...item,
        priceSource: 'rule_estimate' as PriceSource,
        priceDetail:
          (item.priceDetail ? item.priceDetail + '；' : '') + '规则估算价，待核实（建议补充产品价格库）',
      };
    }
    const factor = 1; // 价格因子仅在规则层应用，真实来源价格不缩放
    return {
      ...item,
      unitPrice: Math.round(hit.price * factor),
      priceSource: hit.source,
      priceDetail: hit.sourceDetail + (hit.confidence === 'low' ? '（价格待核实）' : ''),
    };
  });
}
