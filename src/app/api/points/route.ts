export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';
import { getSiteConfigValues } from '@/lib/site-config';

// 积分奖励规则默认值（当 site_config 未配置时回退使用）
const DEFAULT_POINTS_RULES = {
  register: 10,
  daily_login: 1,
  upload_price: 5,
  upload_doc: 10,
  upload_case: 20,
  upload_drawing: 15,
  data_adopted: 50,
  invite_friend: 30,
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
 * 获取积分规则值，优先读取 site_config
 */
async function getPointsRule(type: string): Promise<number> {
  const defaultValue = DEFAULT_POINTS_RULES[type as keyof typeof DEFAULT_POINTS_RULES] || 0;
  const configKey = POINTS_CONFIG_KEY_MAP[type];
  if (!configKey) return defaultValue;

  const configs = await getSiteConfigValues([configKey]);
  const value = configs[configKey];
  if (value === null || value === undefined || value === '') return defaultValue;

  const parsed = parseFloat(value);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

// 增加积分
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { user_id, type, reference_id, description, custom_points } = body;

    if (!user_id || !type) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    const db = getSupabaseServiceClient();

    // 获取积分规则
    const rulePoints = custom_points || await getPointsRule(type);
    const points = Number(rulePoints) || 0;

    if (points === 0) {
      return NextResponse.json(
        { error: '无效的积分类型' },
        { status: 400 }
      );
    }

    // 创建积分记录
    const { data: record, error: recordError } = await db
      .from('point_records')
      .insert({
        user_id,
        points,
        type,
        reference_id,
        description: description || `积分奖励：${type}`
      })
      .select()
      .single();

    if (recordError) {
      console.error('[Points] 创建积分记录失败:', recordError);
      return NextResponse.json(
        { error: '创建积分记录失败' },
        { status: 500 }
      );
    }

    // 更新用户积分
    const { data: user, error: userError } = await db
      .from('users')
      .select('points, total_points')
      .eq('id', user_id)
      .single();

    if (userError) {
      console.error('[Points] 查询用户失败:', userError);
      return NextResponse.json(
        { error: '查询用户失败' },
        { status: 500 }
      );
    }

    const newPoints = Math.max(0, (user.points || 0) + points);
    const newTotalPoints = (user.total_points || 0) + Math.max(0, points);

    const { error: updateError } = await db
      .from('users')
      .update({
        points: newPoints,
        total_points: newTotalPoints
      })
      .eq('id', user_id);

    if (updateError) {
      console.error('[Points] 更新用户积分失败:', updateError);
      return NextResponse.json(
        { error: '更新用户积分失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      points,
      new_balance: newPoints,
      total_points: newTotalPoints,
      record
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

    if (!user_id) {
      return NextResponse.json(
        { error: '缺少用户ID' },
        { status: 400 }
      );
    }

    const db = getSupabaseServiceClient();

    // 获取用户信息（用户可能不在 users 表中，用 maybeSingle 避免报错）
    const { data: user } = await db
      .from('users')
      .select('points, total_points')
      .eq('id', user_id)
      .maybeSingle();

    // 获取积分记录（最近50条）
    const { data: records, error: recordsError } = await db
      .from('point_records')
      .select('*')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (recordsError) {
      console.error('[Points] 查询积分记录失败:', recordsError);
      return NextResponse.json(
        { error: '查询积分记录失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      user: {
        points: user.points || 0,
        total_points: user.total_points || 0
      },
      records: records || []
    });
  } catch (error) {
    console.error('[Points] 请求失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
