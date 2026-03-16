/**
 * 验证 password_hash 字段并显示待迁移用户
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// 加载环境变量
function loadEnv() {
  const envPaths = [
    path.resolve(process.cwd(), '.env.local'),
    path.resolve(process.cwd(), '.env.production'),
    path.resolve(process.cwd(), '.env'),
  ];

  for (const envPath of envPaths) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIndex = trimmed.indexOf('=');
          if (eqIndex > 0) {
            const key = trimmed.substring(0, eqIndex);
            let value = trimmed.substring(eqIndex + 1);
            // Remove quotes
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
              value = value.slice(1, -1);
            }
            if (!process.env[key]) {
              process.env[key] = value;
            }
          }
        }
      });
    }
  }
}

loadEnv();

async function runMigration() {
  console.log('========================================');
  console.log('  数据库迁移：验证 password_hash 字段');
  console.log('========================================\n');

  // 尝试多种环境变量名称
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('❌ 缺少 Supabase 配置');
    console.error('\n当前环境变量状态:');
    console.error(`  NEXT_PUBLIC_SUPABASE_URL: ${process.env.NEXT_PUBLIC_SUPABASE_URL ? '已设置' : '未设置'}`);
    console.error(`  SUPABASE_SERVICE_ROLE_KEY: ${process.env.SUPABASE_SERVICE_ROLE_KEY ? '已设置' : '未设置'}`);
    console.error(`  COZE_SUPABASE_URL: ${process.env.COZE_SUPABASE_URL ? '已设置' : '未设置'}`);
    console.error(`  COZE_SUPABASE_ANON_KEY: ${process.env.COZE_SUPABASE_ANON_KEY ? '已设置' : '未设置'}`);
    process.exit(1);
  }

  console.log(`📡 连接到 Supabase: ${url}`);

  const supabase = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  // 先检查字段是否已存在
  console.log('\n📋 检查 password_hash 字段是否已存在...');

  const { error: checkError } = await supabase
    .from('users')
    .select('password_hash')
    .limit(1);

  if (!checkError) {
    console.log('✅ password_hash 字段已存在！');

    // 显示当前用户密码状态
    console.log('\n📊 统计用户密码状态...');

    const { data: allUsers, error: allError } = await supabase
      .from('users')
      .select('id, username, email, password, password_hash, status');

    if (allError) {
      console.error('查询用户失败:', allError.message);
      process.exit(1);
    }

    const totalUsers = allUsers?.length || 0;
    const usersWithHash = allUsers?.filter((u: any) => u.password_hash)?.length || 0;
    const usersWithoutHash = allUsers?.filter((u: any) => !u.password_hash && u.password)?.length || 0;

    console.log(`\n用户统计:`);
    console.log(`  总用户数: ${totalUsers}`);
    console.log(`  已有密码哈希: ${usersWithHash}`);
    console.log(`  待迁移: ${usersWithoutHash}`);

    if (usersWithoutHash > 0) {
      console.log(`\n待迁移用户列表:`);
      console.log('-'.repeat(80));
      allUsers?.filter((u: any) => !u.password_hash && u.password).forEach((u: any) => {
        console.log(`  ${u.username} (${u.email || '无邮箱'}) - 状态: ${u.status}`);
      });
      console.log('-'.repeat(80));
      console.log(`\n运行以下命令开始迁移:`);
      console.log(`  npx tsx scripts/migrate-passwords.ts`);
    }

    return;
  }

  if (checkError.message.includes('column') || checkError.message.includes('does not exist')) {
    console.log('❌ password_hash 字段不存在');
    console.log('\n请在 Supabase 控制台执行以下 SQL:');
    console.log('========================================');
    console.log('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);');
    console.log('========================================');
  } else {
    console.error('❌ 检查字段时出错:', checkError.message);
  }
}

runMigration().catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
