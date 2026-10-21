export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { hasPermission } from '@/lib/auth/roles';
import { getSiteConfigValues } from '@/lib/site-config';
import { pointsService } from '@/lib/points-service';

// 积分奖励规则默认值（当 site_config 未配置时回退使用，数值与 site_config 默认值保持一致）
const DEFAULT_POINTS_RULES = {
  register: 100,
  daily_login: 10,
  upload_price: 5,
  upload_doc: 20,
  upload_case: 20,
  upload_drawing: 5,
  data_adopted: 100,
  invite_friend: 50,
  redeem: -1 // 兑换消耗
};

// 类型到 site_config 键的映射
const POINTS_CONFIG_KEY_MAP: Record<string, string> = {
  register: 'register_points',
  daily_login: 'daily_login_points',
  invite_friend: 'invite_reward_points',
  upload_price: 'upload_file_points',
  upload_doc: 'parse_document_points',
  upload_case: 'parse_document_points',
  upload_drawing: 'upload_file_points',
  data_adopted: 'task_reward_points',
  redeem: '',
};

/**
 * 获取积分规则值，优先读取 points_rules 表，其次 site_config
 */
async function getPointsRule(type: string): Promise<number> {
  const defaultValue = DEFAULT_POINTS_RULES[type as keyof typeof DEFAULT_POINTS_RULES] || 0;
  
  // 先从 points_rules 表读取
  try {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('points_rules')
      .select('base_points')
      .eq('rule_key', type)
      .eq('is_active', true)
      .maybeSingle();
    
    if (!error && data && data.base_points !== null && data.base_points !== undefined) {
      return data.base_points;
    }
  } catch (e) {
    // 表不存在或查询失败，降级到 site_config
    console.warn('[Points] 从 points_rules 读取失败，降级到 site_config:', e);
  }

  // 降级到 site_config
  const configKey = POINTS_CONFIG_KEY_MAP[type];
  if (!configKey) return defaultValue;

  const configs = await getSiteConfigValues([configKey]);
  const value = configs[configKey];
  if (value === null || value === undefined || value === '') return defaultValue;

  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

/**
 * 获取所有积分规则（用于前端展示）
 */
async function getAllPointsRules(): Promise<{ rules: Record<string, number>; ruleNames: Record<string, string> }> {
  try {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('points_rules')
      .select('rule_key, base_points, rule_name')
      .eq('is_active', true);

    if (!error && data) {
      const rules: Record<string, number> = {};
      const ruleNames: Record<string, string> = {};
      data.forEach((r: any) => {
        if (r.rule_key) {
          if (r.base_points !== null && r.base_points !== undefined) {
            rules[r.rule_key] = r.base_points;
          }
          if (r.rule_name) ruleNames[r.rule_key] = r.rule_name;
        }
      });
      return { rules, ruleNames };
    }
  } catch (e) {
    console.warn('[Points] 获取所有规则失败，降级到 site_config:', e);
  }

  // 降级到 site_config
  const config = await getSiteConfigValues([
    'register_points',
    'daily_login_points',
    'invite_reward_points',
    'upload_file_points',
    'parse_document_points',
    'task_reward_points',
    'generate_quote_points',
    'generate_proposal_points',
    'export_quote_points',
  ]);
  return {
    rules: {
      register: parseInt(config.register_points || '0', 10) || DEFAULT_POINTS_RULES.register,
      daily_login: parseInt(config.daily_login_points || '0', 10) || DEFAULT_POINTS_RULES.daily_login,
      invite_friend: parseInt(config.invite_reward_points || '0', 10) || DEFAULT_POINTS_RULES.invite_friend,
      upload_file: parseInt(config.upload_file_points || '0', 10) || DEFAULT_POINTS_RULES.upload_price,
      parse_document: parseInt(config.parse_document_points || '0', 10) || DEFAULT_POINTS_RULES.upload_doc,
      data_adopted: parseInt(config.task_reward_points || '0', 10) || DEFAULT_POINTS_RULES.data_adopted,
      generate_quote: parseInt(config.generate_quote_points || '0', 10) || 5,
      generate_proposal: parseInt(config.generate_proposal_points || '0', 10) || 30,
      export_quote: parseInt(config.export_quote_points || '0', 10) || 5,
      quote_deduct: parseInt(config.generate_quote_points || '0', 10) || -5,
    },
    ruleNames: {},
  };
}

// 增加积分（仅管理员可调用，禁止 custom_points 等任意修改）
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  if (!hasPermission(user, 'user.manage_roles')) {
    return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { user_id, type, reference_id, description } = body;

    if (!user_id || !type) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // 获取积分规则，拒绝自定义积分字段
    const rulePoints = await getPointsRule(type);
    const points = Number(rulePoints) || 0;

    if (points <= 0) {
      return NextResponse.json(
        { error: '无效的积分类型或规则未配置' },
        { status: 400 }
      );
    }

    // 通过原子 RPC 增加积分，避免并发扣减/增加竞态
    const success = await pointsService.addPoints(
      user_id,
      points,
      type,
      description || `积分奖励：${type}`,
      reference_id
    );

    if (!success) {
      return NextResponse.json(
        { error: '增加积分失败' },
        { status: 500 }
      );
    }

    const balance = await pointsService.getUserPoints(user_id);

    return NextResponse.json({
      success: true,
      points,
      new_balance: balance?.points || 0,
      total_points: balance?.totalPoints || 0,
    });
  } catch (error) {
    console.error('[Points] 请求失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

// 获取用户积分记录
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');

    let targetUserId = user_id;

    // 如果没有提供 user_id，尝试从 session 获取当前用户
    if (!targetUserId) {
      const { user: sessionUser } = await requireAuth(request);
      if (sessionUser?.id) {
        targetUserId = sessionUser.id as string;
      }
    }

    if (!targetUserId) {
      return NextResponse.json(
        { success: false, error: '缺少用户ID或登录状态' },
        { status: 400 }
      );
    }

    const db = getSupabaseServiceClient();

    // 获取用户信息：同时读取 points 字段和 metadata->points（积分服务主要更新后者）
    const { data: user, error: userError } = await db
      .from('users')
      .select('points, total_points, metadata')
      .eq('id', targetUserId)
      .maybeSingle();

    if (userError) {
      console.error('[Points API] 查询用户失败:', userError);
    }

    // 兼容历史数据：points 列与 metadata.points 并存，取两者较大值
    const metadataPoints = user?.metadata?.points;
    const columnPoints = user?.points || 0;
    const metaNum = typeof metadataPoints === 'number' ? metadataPoints : (parseInt(metadataPoints || '0', 10) || 0);
    const currentPoints = Math.max(columnPoints, metaNum);
    const metadataTotal = user?.metadata?.total_points;
    const metaTotalNum = typeof metadataTotal === 'number' ? metadataTotal : (parseInt(metadataTotal || '0', 10) || 0);
    const currentTotalPoints = Math.max(user?.total_points || 0, metaTotalNum);

    // 同时查询两套积分记录表，合并返回（业务操作主要写入 point_logs，但 point_records 也有效）
    const [recordsResult, logsResult] = await Promise.all([
      db
        .from('point_records')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(50),
      db
        .from('point_logs')
        .select('*')
        .eq('user_id', targetUserId)
        .order('created_at', { ascending: false })
        .limit(50)
    ]);

    if (recordsResult.error) {
      console.error('[Points API] 查询 point_records 失败:', recordsResult.error);
    }
    if (logsResult.error) {
      console.error('[Points API] 查询 point_logs 失败:', logsResult.error);
    }

    // 合并两套记录，统一字段格式，按时间倒序排列，去重
    const allRawRecords = [
      ...(recordsResult.data || []),
      ...(logsResult.data || [])
    ];

    const seenIds = new Set<string>();
    const unifiedRecords = allRawRecords
      .map((r: any) => ({
        id: r.id,
        user_id: r.user_id,
        points: r.points,
        type: r.type,
        description: r.description || r.type || '积分变动',
        reference_id: r.reference_id,
        balance_after: r.balance_after,
        created_at: r.created_at
      }))
      .filter((r) => {
        // 使用业务字段组合去重，与管理后台保持一致
        // 解决 point_logs/point_records 双写时 id 不同导致的重复显示
        const key = `${r.user_id}|${r.points}|${r.type}|${r.description}|${r.created_at}`;
        if (seenIds.has(key)) return false;
        seenIds.add(key);
        return true;
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 50);

    // 🆕 从 points_rules 表读取所有积分规则
    const { rules, ruleNames } = await getAllPointsRules();

    // 从 point_log_types 读取中文类型映射
    const { data: typeData } = await db
      .from('point_log_types')
      .select('type_code, type_name');
    const typeLabels: Record<string, string> = {};
    (typeData || []).forEach((t: any) => {
      if (t.type_code && t.type_name) typeLabels[t.type_code] = t.type_name;
    });

    return NextResponse.json({
      success: true,
      points: currentPoints,
      total_points: currentTotalPoints,
      records: unifiedRecords,
      rules,
      ruleNames,
      typeLabels,
    });
  } catch (error) {
    console.error('[Points API] GET 请求失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器错误' },
      { status: 500 }
    );
  }
}
