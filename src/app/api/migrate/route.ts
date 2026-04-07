import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 自动迁移 API - 通过 Supabase JS client 检测并创建缺失的表
 * 
 * 注意：Supabase REST API 不支持 DDL（CREATE TABLE 等）
 * 此 API 检测表是否存在，如果不存在则返回需要执行的 SQL
 * 
 * 对于 pg 直连不可用的环境（如 WSL），可以在 Supabase Dashboard 的
 * SQL Editor 中手动执行返回的 SQL
 */
export async function POST() {
  try {
    const sb = getSupabaseServiceClient();
    
    // 检测表是否存在（通过尝试查询来推断）
    const tables = ['business_profiles', 'customer_projects'];
    const missingTables: string[] = [];
    
    for (const table of tables) {
      const { error } = await sb.from(table).select('id').limit(1);
      if (error && error.code === '42P01') {
        // 关系不存在
        missingTables.push(table);
      }
    }
    
    // 检查 customers 表是否有 user_id 列
    const { error: colError } = await sb.from('customers').select('user_id').limit(1);
    const needsUserId = colError && colError.message?.includes('user_id');
    
    if (missingTables.length === 0 && !needsUserId) {
      return NextResponse.json({ 
        success: true, 
        message: 'All tables already exist',
        tables_needed: []
      });
    }
    
    const sql = [];
    
    if (missingTables.includes('business_profiles')) {
      sql.push(`
CREATE TABLE IF NOT EXISTS business_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  company_name VARCHAR(200),
  company_address TEXT,
  contact_person VARCHAR(100),
  phone VARCHAR(50),
  email VARCHAR(200),
  tax_number VARCHAR(50),
  bank_name VARCHAR(100),
  bank_account VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);`);
    }
    
    if (needsUserId) {
      sql.push(`
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='user_id') THEN
    ALTER TABLE customers ADD COLUMN user_id UUID REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;`);
    }
    
    if (missingTables.includes('customer_projects')) {
      sql.push(`
CREATE TABLE IF NOT EXISTS customer_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  project_name VARCHAR(200) NOT NULL,
  project_type VARCHAR(50),
  budget DECIMAL(12,2),
  status VARCHAR(20) DEFAULT 'active',
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`);
    }
    
    return NextResponse.json({
      success: false,
      message: 'Tables need to be created. Please run the SQL below in Supabase Dashboard > SQL Editor.',
      missing_tables: missingTables,
      needs_user_id_column: needsUserId,
      sql: sql.join('\n\n')
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
