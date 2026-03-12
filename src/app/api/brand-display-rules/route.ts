import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * 品牌展示规则配置API
 * 
 * 功能：
 * - GET: 获取所有展示规则
 * - POST: 创建新的展示规则
 */

// 初始化Supabase客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    db: {
      schema: 'public'
    }
  }
);

/**
 * 获取所有展示规则
 * 
 * 查询参数：
 * - active: boolean - 是否只获取启用的规则（可选）
 */
export async function GET(request: NextRequest) {
  console.log('[DisplayRules] GET 获取展示规则列表');

  try {
    const searchParams = request.nextUrl.searchParams;
    const activeOnly = searchParams.get('active') === 'true';

    let query = supabase
      .from('brand_display_rules')
      .select('*')
      .order('created_at', { ascending: false });

    // 筛选启用的规则
    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[DisplayRules] 查询失败:', error);
      return NextResponse.json(
        { error: '查询失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ rules: data || [] });
  } catch (error) {
    console.error('[DisplayRules] 异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * 创建新的展示规则
 * 
 * 请求体：
 * - rule_name: string - 规则名称（必填）
 * - rule_description: string - 规则描述（可选）
 * - level_1_quota: number - 1级品牌展示数量（默认2）
 * - level_2_quota: number - 2级品牌展示数量（默认2）
 * - level_3_quota: number - 3级品牌展示数量（默认2）
 * - level_4_quota: number - 4级品牌展示数量（默认1）
 * - level_5_quota: number - 5级品牌展示数量（默认0）
 * - enable_same_level_random: boolean - 同等级内是否随机排序（默认false）
 * - enable_free_brands: boolean - 是否展示免费品牌（默认true）
 * - max_total_brands: number - 最多展示品牌总数（默认10）
 * - payment_level_weight: number - 付费等级权重（默认0.6）
 * - payment_amount_weight: number - 付费金额权重（默认0.3）
 * - display_weight_weight: number - 展示权重（默认0.1）
 * - enable_cache: boolean - 是否启用缓存（默认true）
 * - cache_ttl: number - 缓存过期时间（默认300）
 */
export async function POST(request: NextRequest) {
  console.log('[DisplayRules] POST 创建新的展示规则');

  try {
    const body = await request.json();

    // 验证必填字段
    if (!body.rule_name) {
      return NextResponse.json(
        { error: '规则名称不能为空' },
        { status: 400 }
      );
    }

    // 验证权重总和（可选）
    const levelWeight = body.payment_level_weight ?? 0.6;
    const amountWeight = body.payment_amount_weight ?? 0.3;
    const displayWeight = body.display_weight_weight ?? 0.1;
    
    const totalWeight = levelWeight + amountWeight + displayWeight;
    if (Math.abs(totalWeight - 1.0) > 0.01) {
      console.warn('[DisplayRules] ⚠️ 权重总和不为1，当前总和:', totalWeight);
    }

    // 准备插入数据
    const now = new Date().toISOString();
    const insertData = {
      rule_name: body.rule_name,
      rule_description: body.rule_description || null,

      // 各等级展示配额
      level_1_quota: body.level_1_quota ?? 2,
      level_2_quota: body.level_2_quota ?? 2,
      level_3_quota: body.level_3_quota ?? 2,
      level_4_quota: body.level_4_quota ?? 1,
      level_5_quota: body.level_5_quota ?? 0,

      // 排序配置
      enable_same_level_random: body.enable_same_level_random ?? false,
      enable_free_brands: body.enable_free_brands ?? true,
      max_total_brands: body.max_total_brands ?? 10,

      // 权重配置
      payment_level_weight: levelWeight,
      payment_amount_weight: amountWeight,
      display_weight_weight: displayWeight,

      // 缓存配置
      enable_cache: body.enable_cache ?? true,
      cache_ttl: body.cache_ttl ?? 300,

      // 状态
      is_active: body.is_active !== undefined ? body.is_active : true,

      // 时间戳
      created_at: now,
      updated_at: now
    };

    const { data, error } = await supabase
      .from('brand_display_rules')
      .insert(insertData)
      .select()
      .single();

    if (error) {
      console.error('[DisplayRules] 插入失败:', error);
      return NextResponse.json(
        { error: '创建失败', details: error.message },
        { status: 500 }
      );
    }

    console.log('[DisplayRules] ✅ 展示规则创建成功:', data.rule_name);
    return NextResponse.json({
      success: true,
      rule: data
    });
  } catch (error) {
    console.error('[DisplayRules] 异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
