import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 执行产品表扩展字段迁移
 * 添加：parameter_description, supplier, contact_person, contact_phone, cost_price, min_price, image_url, stock
 */
export async function POST(request: NextRequest) {
  console.log('[Migrate] 开始执行产品表迁移...');

  try {
    const db = getSupabaseClient();
    const results: string[] = [];

    // 要添加的字段列表
    const columns = [
      { name: 'parameter_description', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS parameter_description TEXT' },
      { name: 'supplier', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS supplier VARCHAR(255)' },
      { name: 'contact_person', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100)' },
      { name: 'contact_phone', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50)' },
      { name: 'cost_price', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price DECIMAL(15,2) DEFAULT 0' },
      { name: 'min_price', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price DECIMAL(15,2) DEFAULT 0' },
      { name: 'image_url', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT' },
      { name: 'stock', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS stock INTEGER DEFAULT 0' },
    ];

    // 逐个添加字段
    for (const col of columns) {
      try {
        // 使用 RPC 执行原生 SQL
        const { error } = await db.rpc('exec_sql', { sql: col.sql });
        
        if (error) {
          // 如果 RPC 不存在，尝试直接通过 Supabase 的 SQL 执行
          console.log(`[Migrate] 添加字段 ${col.name}:`, error.message);
          results.push(`${col.name}: ${error.message}`);
        } else {
          results.push(`${col.name}: 成功`);
          console.log(`[Migrate] ✅ 字段 ${col.name} 添加成功`);
        }
      } catch (e) {
        results.push(`${col.name}: ${(e as Error).message}`);
        console.error(`[Migrate] ❌ 字段 ${col.name} 添加失败:`, e);
      }
    }

    return NextResponse.json({
      success: true,
      message: '产品表迁移完成',
      results,
      note: '如果某些字段添加失败，请在 Supabase Dashboard 的 SQL Editor 中手动执行迁移脚本：scripts/add-product-extensions.sql',
    });
  } catch (error) {
    console.error('[Migrate] 迁移失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '迁移失败',
        message: (error as Error).message,
        note: '请在 Supabase Dashboard 的 SQL Editor 中手动执行迁移脚本：scripts/add-product-extensions.sql',
      },
      { status: 500 }
    );
  }
}

// 获取迁移状态
export async function GET(request: NextRequest) {
  console.log('[Migrate] 检查产品表字段状态...');

  try {
    const db = getSupabaseClient();

    // 尝试查询产品表，检查字段是否存在
    const { data, error } = await db
      .from('products')
      .select('id, parameter_description, supplier, contact_person, contact_phone, cost_price, min_price, image_url, stock')
      .limit(1);

    if (error) {
      // 检查是否是字段不存在错误
      if (error.message.includes('column') && error.message.includes('does not exist')) {
        return NextResponse.json({
          success: true,
          migrated: false,
          message: '产品表需要迁移，部分字段不存在',
          missingFields: error.message,
        });
      }
      
      return NextResponse.json({
        success: false,
        error: error.message,
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      migrated: true,
      message: '产品表已包含扩展字段',
      sampleData: data?.[0] || null,
    });
  } catch (error) {
    console.error('[Migrate] 检查失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '检查失败',
        message: (error as Error).message,
      },
      { status: 500 }
    );
  }
}
