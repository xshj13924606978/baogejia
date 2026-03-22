import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 计费配置管理API
 *
 * 使用 knowledge_entries 表（system_config 类型）持久化计费配置。
 * 原因：token_pricing_config 表的 RLS 策略缺失，PostgREST 无法访问。
 *
 * GET: 获取当前计费配置
 * POST: 更新计费配置
 */

const CONFIG_RECORD_ID = '00000000-0000-4000-8000-000000000001';

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

export async function GET() {
  try {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('knowledge_entries')
      .select('description, updated_at')
      .eq('id', CONFIG_RECORD_ID)
      .single();

    if (error || !data?.description) {
      return NextResponse.json({ success: true, data: DEFAULT_CONFIG });
    }

    const saved = JSON.parse(data.description);
    return NextResponse.json({ success: true, data: mergeConfig(saved) });
  } catch (error) {
    console.error('[BillingConfig API] 获取异常:', error);
    return NextResponse.json({ success: true, data: DEFAULT_CONFIG });
  }
}

export async function POST(request: NextRequest) {
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
      .single();

    const current = existing?.description ? JSON.parse(existing.description) : {};
    const merged = { ...current, ...body };

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
        { onConflict: 'id' },
      );

    if (error) {
      console.error('[BillingConfig API] 保存失败:', error.message);
      return NextResponse.json({ success: false, error: '保存失败' }, { status: 500 });
    }

    console.log('[BillingConfig API] 计费配置已更新');
    return NextResponse.json({ success: true, message: '配置保存成功', data: mergeConfig(merged) });
  } catch (error) {
    console.error('[BillingConfig API] 更新异常:', error);
    return NextResponse.json({ success: false, error: '保存失败' }, { status: 500 });
  }
}
