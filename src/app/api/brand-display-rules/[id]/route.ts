import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { brandRankingService } from '@/lib/brand-ranking-service';

/**
 * 单个展示规则管理API
 *
 * 功能：
 * - GET: 获取单个规则详情
 * - PUT: 更新规则配置
 * - DELETE: 删除规则
 */

// 初始化Supabase客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    db: {
      schema: 'public',
    },
  }
);

/**
 * 获取单个规则详情
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log('[DisplayRules] GET 获取规则详情:', id);

  try {
    const { data, error } = await supabase
      .from('brand_display_rules')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      console.error('[DisplayRules] 查询失败:', error);
      return NextResponse.json({ error: '规则不存在' }, { status: 404 });
    }

    return NextResponse.json({ rule: data });
  } catch (error) {
    console.error('[DisplayRules] 异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * 更新规则配置
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  console.log('[DisplayRules] PUT 更新规则配置:', id);

  try {
    const body = await request.json();

    // 准备更新数据
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    // 只更新提供的字段
    const allowedFields = [
      'rule_name',
      'rule_description',
      'level_1_quota',
      'level_2_quota',
      'level_3_quota',
      'level_4_quota',
      'level_5_quota',
      'enable_same_level_random',
      'enable_free_brands',
      'max_total_brands',
      'payment_level_weight',
      'payment_amount_weight',
      'display_weight_weight',
      'enable_cache',
      'cache_ttl',
      'is_active',
    ];

    allowedFields.forEach((field) => {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    });

    const { data, error } = await supabase
      .from('brand_display_rules')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[DisplayRules] 更新失败:', error);
      return NextResponse.json({ error: '更新失败', details: error.message }, { status: 500 });
    }

    // 清除缓存，使新规则生效
    brandRankingService.clearCache();

    console.log('[DisplayRules] ✅ 规则更新成功:', data.rule_name);
    return NextResponse.json({
      success: true,
      rule: data,
    });
  } catch (error) {
    console.error('[DisplayRules] 异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * 删除规则
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  console.log('[DisplayRules] DELETE 删除规则:', id);

  try {
    const { error } = await supabase.from('brand_display_rules').delete().eq('id', id);

    if (error) {
      console.error('[DisplayRules] 删除失败:', error);
      return NextResponse.json({ error: '删除失败', details: error.message }, { status: 500 });
    }

    // 清除缓存
    brandRankingService.clearCache();

    console.log('[DisplayRules] ✅ 规则删除成功');
    return NextResponse.json({
      success: true,
      message: '规则删除成功',
    });
  } catch (error) {
    console.error('[DisplayRules] 异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
