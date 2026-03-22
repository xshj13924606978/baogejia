import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 计费配置管理API
 *
 * GET: 获取当前计费配置（从 site_config 表持久化读取）
 * POST: 更新计费配置（持久化到 site_config 表）
 */

const CONFIG_KEYS = [
  'billing_yuan_to_tokens',
  'billing_yuan_to_points',
  'billing_points_to_tokens',
  'billing_level1_input_rate',
  'billing_level1_output_rate',
  'billing_level2_input_rate',
  'billing_level2_output_rate',
  'billing_level3_input_rate',
  'billing_level3_output_rate',
  'billing_level4_input_rate',
  'billing_level4_output_rate',
  'billing_level5_input_rate',
  'billing_level5_output_rate',
];

const DEFAULTS: Record<string, number> = {
  billing_yuan_to_tokens: 1000,
  billing_yuan_to_points: 100,
  billing_points_to_tokens: 10,
  billing_level1_input_rate: 1.0,
  billing_level1_output_rate: 1.0,
  billing_level2_input_rate: 0.9,
  billing_level2_output_rate: 0.9,
  billing_level3_input_rate: 0.8,
  billing_level3_output_rate: 0.8,
  billing_level4_input_rate: 0.7,
  billing_level4_output_rate: 0.7,
  billing_level5_input_rate: 0.6,
  billing_level5_output_rate: 0.6,
};

const FIELD_MAP: Record<string, string> = {
  billing_yuan_to_tokens: 'yuanToTokens',
  billing_yuan_to_points: 'yuanToPoints',
  billing_points_to_tokens: 'pointsToTokens',
  billing_level1_input_rate: 'level1InputRate',
  billing_level1_output_rate: 'level1OutputRate',
  billing_level2_input_rate: 'level2InputRate',
  billing_level2_output_rate: 'level2OutputRate',
  billing_level3_input_rate: 'level3InputRate',
  billing_level3_output_rate: 'level3OutputRate',
  billing_level4_input_rate: 'level4InputRate',
  billing_level4_output_rate: 'level4OutputRate',
  billing_level5_input_rate: 'level5InputRate',
  billing_level5_output_rate: 'level5OutputRate',
};

/**
 * GET: 获取计费配置
 */
export async function GET() {
  try {
    const db = getSupabaseServiceClient();

    const { data: rows, error } = await db
      .from('site_config')
      .select('config_key, config_value')
      .in('config_key', CONFIG_KEYS);

    // 如果 site_config 表不存在，返回默认值
    if (error) {
      console.log('[BillingConfig API] site_config 表不存在，返回默认配置');
      return NextResponse.json({ success: true, data: toCamelCase(DEFAULTS) });
    }

    // 合并：数据库值覆盖默认值
    const merged = { ...DEFAULTS };
    (rows || []).forEach((row: any) => {
      if (row.config_value !== null && row.config_value !== undefined) {
        merged[row.config_key] = Number(row.config_value);
      }
    });

    return NextResponse.json({ success: true, data: toCamelCase(merged) });
  } catch (error) {
    console.error('[BillingConfig API] 获取配置异常:', error);
    return NextResponse.json({ success: true, data: toCamelCase(DEFAULTS) });
  }
}

/**
 * POST: 更新计费配置
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证必要字段
    if (!body.yuanToTokens || !body.yuanToPoints || !body.pointsToTokens) {
      return NextResponse.json({ success: false, error: '缺少必要参数（yuanToTokens/yuanToPoints/pointsToTokens）' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 构建 upsert 数据
    const rows = CONFIG_KEYS.map((key) => {
      const camelField = FIELD_MAP[key];
      const value = body[camelField] ?? DEFAULTS[key];
      return {
        config_key: key,
        config_value: String(value),
        config_type: 'number',
        category: 'billing',
        label: camelField,
      };
    });

    // 批量 upsert
    let { error } = await db
      .from('site_config')
      .upsert(rows, { onConflict: 'config_key' });

    // 如果表不存在，尝试建表后重试
    if (error) {
      console.log('[BillingConfig API] upsert 失败，尝试创建 site_config 表');
      const { error: createError } = await db.rpc('exec_sql', {
        sql: `
          CREATE TABLE IF NOT EXISTS site_config (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            config_key VARCHAR(100) UNIQUE NOT NULL,
            config_value TEXT,
            config_type VARCHAR(20) DEFAULT 'string',
            category VARCHAR(50) DEFAULT 'general',
            label VARCHAR(100),
            description TEXT,
            is_public BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_site_config_category ON site_config(category);
          CREATE INDEX IF NOT EXISTS idx_site_config_key ON site_config(config_key);
          ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;
          CREATE POLICY "Admin all" ON site_config FOR ALL USING (true) WITH CHECK (true);
        `,
      });
      if (!createError) {
        const retry = await db.from('site_config').upsert(rows, { onConflict: 'config_key' });
        error = retry.error;
      }
      if (error) {
        console.error('[BillingConfig API] 建表或重试仍失败:', error.message);
      }
    }

    if (error) {
      return NextResponse.json({
        success: false,
        error: '配置未持久化：site_config 表不存在，请先通过系统设置初始化数据库',
      }, { status: 503 });
    }

    console.log('[BillingConfig API] 计费配置已更新');
    return NextResponse.json({ success: true, message: '配置保存成功' });
  } catch (error) {
    console.error('[BillingConfig API] 更新异常:', error);
    return NextResponse.json({ success: false, error: '保存失败' }, { status: 500 });
  }
}

function toCamelCase(obj: Record<string, number>): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = FIELD_MAP[key] || key;
    result[camelKey] = value;
  }
  return result;
}
