import { NextResponse } from 'next/server';
import { Pool } from 'pg';

/**
 * 一键迁移：为 token_pricing_config 表添加 RLS 策略
 *
 * 当 billing config API 报错 "Could not find the table in schema cache" 时，
 * 访问此端点即可修复。
 *
 * 使用方式：GET /api/migrate/billing-config
 */

export async function GET() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    console.log('[Migrate billing-config] 开始迁移...');

    // 1. 启用 RLS
    await pool.query('ALTER TABLE token_pricing_config ENABLE ROW LEVEL SECURITY');
    console.log('[Migrate billing-config] RLS 已启用');

    // 2. 允许 service role 完全访问
    await pool.query(`
      CREATE POLICY "Service role all access on token_pricing_config"
        ON token_pricing_config
        FOR ALL
        TO supabase_service_role
        USING (true)
        WITH CHECK (true);
    `);
    console.log('[Migrate billing-config] service_role 策略已创建');

    // 3. 允许匿名读取（可选，供前端查询）
    await pool.query(`
      CREATE POLICY "Allow anon read on token_pricing_config"
        ON token_pricing_config
        FOR SELECT
        TO anon
        USING (true);
    `);
    console.log('[Migrate billing-config] anon 读取策略已创建');

    // 4. 允许认证用户读取
    await pool.query(`
      CREATE POLICY "Allow authenticated read on token_pricing_config"
        ON token_pricing_config
        FOR SELECT
        TO authenticated
        USING (true);
    `);
    console.log('[Migrate billing-config] authenticated 读取策略已创建');

    // 5. 允许认证用户更新
    await pool.query(`
      CREATE POLICY "Allow authenticated update on token_pricing_config"
        ON token_pricing_config
        FOR UPDATE
        TO authenticated
        USING (true)
        WITH CHECK (true);
    `);
    console.log('[Migrate billing-config] authenticated 更新策略已创建');

    // 6. 允许认证用户插入
    await pool.query(`
      CREATE POLICY "Allow authenticated insert on token_pricing_config"
        ON token_pricing_config
        FOR INSERT
        TO authenticated
        WITH CHECK (true);
    `);
    console.log('[Migrate billing-config] authenticated 插入策略已创建');

    // 7. 刷新 PostgREST schema cache
    await pool.query("NOTIFY pgrst, 'reload schema';");
    console.log('[Migrate billing-config] PostgREST schema cache 已刷新');

    await pool.end();

    return NextResponse.json({
      success: true,
      message: '迁移完成：token_pricing_config 表的 RLS 策略已配置',
    });
  } catch (error: any) {
    console.error('[Migrate billing-config] 迁移失败:', error.message);
    await pool.end().catch(() => {});
    return NextResponse.json({
      success: false,
      error: error.message,
      hint: '如果连接失败，请在 Supabase Dashboard SQL Editor 中手动执行迁移 SQL',
    }, { status: 500 });
  }
}
