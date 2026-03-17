#!/usr/bin/env tsx
/**
 * 数据库迁移 - 通过 Supabase REST API 执行
 * 
 * 这个脚本使用 Supabase 的 service_role key 通过 REST API 执行 SQL
 * 
 * 使用方法:
 *   pnpm tsx scripts/migrate-via-rest.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('❌ 缺少环境变量: NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  // 创建 Supabase 客户端
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  console.log('🚀 Supabase 数据库迁移工具');
  console.log('='.repeat(60));

  // 读取迁移文件
  const migrationFile = path.join(__dirname, 'migrations', '04_permission_system.sql');
  
  if (!fs.existsSync(migrationFile)) {
    console.error(`❌ 迁移文件不存在: ${migrationFile}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationFile, 'utf-8');
  console.log(`📄 迁移文件: 04_permission_system.sql`);
  console.log(`📊 大小: ${sql.length} 字节`);

  // 由于 Supabase REST API 不支持直接执行 DDL
  // 我们需要分步创建表和插入数据

  console.log('\n⏳ 开始执行迁移...\n');

  // 方法: 直接使用 PostgreSQL 连接执行
  // 由于网络限制，我们提供指导

  console.log('⚠️  由于 Supabase REST API 不支持直接执行 DDL，请使用以下方式:');
  console.log('\n方式1: Supabase Dashboard SQL Editor (推荐)');
  console.log(`   https://supabase.com/dashboard/project/tjbnjrcgmyiwudqptfhc/sql`);
  console.log('   复制 scripts/migrations/04_permission_system.sql 内容并执行');
  
  console.log('\n方式2: 安装 psql 后执行');
  console.log('   sudo apt-get install postgresql-client  # Ubuntu/Debian');
  console.log('   brew install postgresql                # macOS');
  console.log(`   psql "${process.env.DATABASE_URL}" -f scripts/migrations/04_permission_system.sql`);

  console.log('\n方式3: 使用 Supabase CLI');
  console.log('   npm install -g supabase');
  console.log('   supabase link --project-ref tjbnjrcgmyiwudqptfhc');
  console.log('   supabase db push');

  // 尝试检测表是否已存在
  console.log('\n📊 检测权限表状态...');
  
  const { data: permissionsCheck, error: permissionsError } = await supabase
    .from('permissions')
    .select('id')
    .limit(1);

  if (permissionsError) {
    if (permissionsError.code === '42P01') {
      console.log('   ❌ permissions 表不存在 - 需要执行迁移');
    } else {
      console.log(`   ⚠️  检测出错: ${permissionsError.message}`);
    }
  } else {
    console.log('   ✅ permissions 表已存在');
  }

  const { data: rolePermsCheck, error: rolePermsError } = await supabase
    .from('role_permissions')
    .select('id')
    .limit(1);

  if (rolePermsError) {
    if (rolePermsError.code === '42P01') {
      console.log('   ❌ role_permissions 表不存在 - 需要执行迁移');
    }
  } else {
    console.log('   ✅ role_permissions 表已存在');
  }

  const { data: userPermsCheck, error: userPermsError } = await supabase
    .from('user_permissions')
    .select('id')
    .limit(1);

  if (userPermsError) {
    if (userPermsError.code === '42P01') {
      console.log('   ❌ user_permissions 表不存在 - 需要执行迁移');
    }
  } else {
    console.log('   ✅ user_permissions 表已存在');
  }

  console.log('\n' + '='.repeat(60));
}

main().catch(console.error);
