import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * 计费配置管理API
 *
 * 数据源约定（#202608252200 统一双源，修复"保存不生效"）：
 * - knowledge_entries（system_config，id 固定）  → 后台展示主源，含完整 input/output 双倍率字段
 * - site_config.points_exchange_config          → 真实计费生效源（points-service.getBillingConfig 读取）
 * POST 时两处同时写入，GET 优先读 knowledge_entries，缺失时回退 site_config（兼容历史数据）。
 *
 * GET: 获取当前计费配置（含等级名称列表）
 * POST: 更新计费配置（同步写入两个数据源）
 */

const CONFIG_RECORD_ID = '00000000-0000-4000-8000-000000000001';
// 真实计费生效源键名（与 points-service.ts getBillingConfig 保持一致）
const SITE_CONFIG_KEY = 'points_exchange_config';

const DEFAULT_CONFIG = {
  configName: '默认配置',
  yuanToTokens: 1000,
  yuanToPoints: 100,
  pointsToTokens: 10,
  level1InputRate: 1.0,
  level1OutputRate: 1.0,
  level2InputRate: 0.9,
  level2OutputRate: 0.9,
  level3InputRate: 0.8,
  level3OutputRate: 0.8,
  level4InputRate: 0.7,
  level4OutputRate: 0.7,
  level5InputRate: 0.6,
  level5OutputRate: 0.6,
};

function mergeConfig(saved: Partial<typeof DEFAULT_CONFIG>): typeof DEFAULT_CONFIG {
  return { ...DEFAULT_CONFIG, ...saved };
}

/** 将 site_config 单倍率配置展开为 input/output 双倍率（兼容历史数据回显） */
function expandSiteConfig(sc: Record<string, any>): Partial<typeof DEFAULT_CONFIG> {
  const pick = (k: string) => (typeof sc[k] === 'number' ? sc[k] : undefined);
  return {
    yuanToTokens: pick('yuanToTokens'),
    yuanToPoints: pick('yuanToPoints'),
    pointsToTokens: pick('pointsToTokens'),
    level1InputRate: pick('level1Rate'),
    level1OutputRate: pick('level1Rate'),
    level2InputRate: pick('level2Rate'),
    level2OutputRate: pick('level2Rate'),
    level3InputRate: pick('level3Rate'),
    level3OutputRate: pick('level3Rate'),
    level4InputRate: pick('level4Rate'),
    level4OutputRate: pick('level4Rate'),
    level5InputRate: pick('level5Rate'),
    level5OutputRate: pick('level5Rate'),
  };
}

/** 将 input/output 双倍率压缩为 site_config 单倍率（取均值，与 token-billing 口径一致） */
function toSiteConfig(cfg: Record<string, any>): Record<string, number> {
  const avg = (i: any, o: any): number => {
    const a = Number(i ?? 1);
    const b = Number(o ?? 1);
    return (a + b) / 2;
  };
  return {
    yuanToTokens: Number(cfg.yuanToTokens ?? DEFAULT_CONFIG.yuanToTokens),
    yuanToPoints: Number(cfg.yuanToPoints ?? DEFAULT_CONFIG.yuanToPoints),
    pointsToTokens: Number(cfg.pointsToTokens ?? DEFAULT_CONFIG.pointsToTokens),
    level1Rate: avg(cfg.level1InputRate, cfg.level1OutputRate),
    level2Rate: avg(cfg.level2InputRate, cfg.level2OutputRate),
    level3Rate: avg(cfg.level3InputRate, cfg.level3OutputRate),
    level4Rate: avg(cfg.level4InputRate, cfg.level4OutputRate),
    level5Rate: avg(cfg.level5InputRate, cfg.level5OutputRate),
  };
}

/** 从 level_definitions 读取等级名称（杜绝前端硬编码） */
async function readLevelDefinitions(db: any): Promise<{ id: number; name: string }[] | null> {
  const { data, error } = await db
    .from('level_definitions')
    .select('level, name')
    .order('level', { ascending: true });

  if (error || !data || data.length === 0) return null;

  return data.map((item: { level: number; name: string }) => ({
    id: item.level,
    name: item.name,
  }));
}

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const db = getSupabaseServiceClient();

    // 1) 主源：knowledge_entries（完整双倍率字段）
    const { data: ke } = await db
      .from('knowledge_entries')
      .select('description, updated_at')
      .eq('id', CONFIG_RECORD_ID)
      .maybeSingle();

    let saved: Record<string, any> = {};
    if (ke?.description) {
      try {
        saved = JSON.parse(ke.description);
      } catch {
        saved = {};
      }
    }

    // 2) 兼容回退：主源缺失时从真实生效源 site_config 反推
    if (Object.keys(saved).length === 0) {
      const { data: sc } = await db
        .from('site_config')
        .select('config_value')
        .eq('config_key', SITE_CONFIG_KEY)
        .maybeSingle();
      if (sc?.config_value) {
        try {
          saved = expandSiteConfig(JSON.parse(sc.config_value));
        } catch {
          saved = {};
        }
      }
    }

    // 2.5) #202608302200 配置数据动态同步：
    // 基础兑换比例以统一数据源 trade_config 为准（与「交易配置」中心实时联动）
    const { data: tcRecharge } = await db
      .from('trade_config')
      .select('config_value')
      .eq('config_key', 'points.recharge_rate')
      .maybeSingle();
    const { data: tcToken } = await db
      .from('trade_config')
      .select('config_value')
      .eq('config_key', 'points.token_rate')
      .maybeSingle();
    const tcY2P = Number(tcRecharge?.config_value?.rate);
    const tcP2T = Number(tcToken?.config_value?.rate);
    if (Number.isFinite(tcY2P) && tcY2P > 0) saved.yuanToPoints = tcY2P;
    if (Number.isFinite(tcP2T) && tcP2T > 0) saved.pointsToTokens = tcP2T;
    if (Number.isFinite(saved.yuanToPoints) && Number.isFinite(saved.pointsToTokens)) {
      saved.yuanToTokens = saved.yuanToPoints * saved.pointsToTokens;
    }

    // 3) 等级名称（数据库驱动，前端仅 fallback）
    const levels = await readLevelDefinitions(db);

    return NextResponse.json(
      { success: true, data: mergeConfig(saved), levels },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    console.error('[BillingConfig API] 获取异常:', error);
    return NextResponse.json({ success: true, data: DEFAULT_CONFIG, levels: null });
  }
}

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();

    if (!body.yuanToTokens || !body.yuanToPoints || !body.pointsToTokens) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 取当前配置做 merge，保留未传字段
    const { data: existing } = await db
      .from('knowledge_entries')
      .select('description')
      .eq('id', CONFIG_RECORD_ID)
      .maybeSingle();

    const current = existing?.description ? JSON.parse(existing.description) : {};
    const merged = { ...current, ...body };

    // 1) 写入展示主源 knowledge_entries
    const { error } = await db
      .from('knowledge_entries')
      .upsert(
        {
          id: CONFIG_RECORD_ID,
          type: 'system_config',
          title: 'billing_config',
          description: JSON.stringify(merged),
          status: 'active',
          user_id: '00000000-0000-0000-0000-000000000000',
          file_name: 'billing_config.json',
          file_key: 'billing_config',
          file_url: 'system://billing_config',
          file_size: 0,
          file_type: 'json',
        },
        { onConflict: 'id' }
      );

    if (error) {
      console.error('[BillingConfig API] 保存失败:', error.message);
      return NextResponse.json({ success: false, error: '保存失败' }, { status: 500 });
    }

    // 2) 同步写入真实计费生效源 site_config（#202608252200 修复"保存不生效"）
    const siteConfig = toSiteConfig(merged);
    const { error: scError } = await db.from('site_config').upsert(
      {
        config_key: SITE_CONFIG_KEY,
        config_value: JSON.stringify(siteConfig),
        description: '积分兑换配置（points-service 计费生效源，与 billing_config 同步）',
        config_type: 'json',
        category: 'knowledge',
        label: SITE_CONFIG_KEY,
        is_public: false,
      },
      { onConflict: 'config_key' }
    );

    if (scError) {
      console.error('[BillingConfig API] 同步生效源失败:', scError.message);
      return NextResponse.json({ success: false, error: '配置同步生效源失败' }, { status: 500 });
    }

    // 3) #202608302200 配置数据动态同步：
    // 基础兑换比例同步写入统一数据源 trade_config（与「交易配置」中心实时联动）
    const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const safeUpdater = UUID_REGEX.test(user?.id || '') ? user.id : null;
    const syncTradeConfig = async (key: string, value: { rate: number }, description: string, category: string) => {
      const { error: tcError } = await db.from('trade_config').upsert(
        {
          config_key: key,
          config_value: value,
          config_type: 'number',
          description,
          category,
          is_active: true,
          updated_by: safeUpdater,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'config_key' }
      );
      if (tcError) console.error(`[BillingConfig API] 同步 ${key} 到 trade_config 失败:`, tcError.message);
    };
    await syncTradeConfig('points.recharge_rate', { rate: Number(merged.yuanToPoints) }, '1元=多少积分', 'system');
    await syncTradeConfig('points.token_rate', { rate: Number(merged.pointsToTokens) }, '1积分=多少Tokens', 'system');

    return NextResponse.json({ success: true, message: '配置保存成功', data: mergeConfig(merged) });
  } catch (error) {
    console.error('[BillingConfig API] 更新异常:', error);
    return NextResponse.json({ success: false, error: '保存失败' }, { status: 500 });
  }
}
