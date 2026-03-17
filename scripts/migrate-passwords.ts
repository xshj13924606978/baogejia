/**
 * 密码迁移脚本
 * 将明文密码迁移为 bcrypt 加密密码
 *
 * 前置条件:
 *   1. 安装依赖: pnpm add bcrypt && pnpm add -D @types/bcrypt
 *   2. 在数据库中添加 password_hash 字段:
 *      ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
 *
 * 使用方法:
 *   pnpm tsx scripts/migrate-passwords.ts
 *
 * 可选参数:
 *   --dry-run    仅预览将要迁移的用户，不实际执行
 *   --force      强制重新哈希所有密码（即使已有 password_hash）
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const SALT_ROUNDS = 10;

interface User {
  id: string;
  username: string;
  email: string;
  password?: string;
  password_hash?: string;
  status: string;
}

type AppSupabaseClient = SupabaseClient<any, 'public', any>;

function getSupabaseClient(): AppSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.COZE_SUPABASE_ANON_KEY;

  if (!url || !serviceKey) {
    throw new Error('缺少 Supabase 配置，请确保设置了 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function ensurePasswordHashColumn(supabase: AppSupabaseClient): Promise<boolean> {
  console.log('\n📋 检查 password_hash 字段...');

  // 尝试查询 password_hash 字段，检查是否存在
  const { error } = await supabase
    .from('users')
    .select('password_hash')
    .limit(1);

  if (error) {
    if (error.message.includes('column') || error.message.includes('does not exist')) {
      console.log('⚠️  password_hash 字段不存在');
      console.log('\n请先在数据库中添加该字段，执行以下 SQL:');
      console.log('-------------------------------------------');
      console.log('ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);');
      console.log('-------------------------------------------');
      return false;
    }
    // 其他错误
    console.error('检查字段时出错:', error.message);
    return false;
  }

  console.log('✅ password_hash 字段已存在');
  return true;
}

async function migratePasswords(dryRun: boolean = false, force: boolean = false) {
  console.log('========================================');
  console.log('    密码迁移脚本 - 明文 → bcrypt');
  console.log('========================================');

  const supabase = getSupabaseClient();

  // 检查字段是否存在
  const columnExists = await ensurePasswordHashColumn(supabase);
  if (!columnExists) {
    process.exit(1);
  }

  // 查询所有需要迁移的用户
  console.log('\n📋 查询用户数据...');

  let query = supabase
    .from('users')
    .select('id, username, email, password, password_hash, status');

  if (!force) {
    // 只查询还没有 password_hash 的用户
    query = query.is('password_hash', null);
  }

  const { data: users, error } = await query;

  if (error) {
    console.error('❌ 查询用户失败:', error.message);
    process.exit(1);
  }

  if (!users || users.length === 0) {
    console.log('✅ 没有需要迁移的用户');
    return;
  }

  console.log(`\n找到 ${users.length} 个需要迁移的用户:\n`);

  // 显示用户列表
  console.log('ID\t\t\t\t用户名\t\t邮箱\t\t\t状态\t当前密码');
  console.log('-'.repeat(80));
  users.forEach((user: User) => {
    const pwdDisplay = user.password
      ? (user.password.length > 8 ? user.password.substring(0, 8) + '...' : user.password)
      : '(无)';
    console.log(`${user.id}\t${user.username}\t\t${user.email || '(无)'}\t\t${user.status}\t${pwdDisplay}`);
  });

  if (dryRun) {
    console.log('\n🔍 [DRY RUN] 以上用户将被迁移');
    console.log('移除 --dry-run 参数以执行实际迁移');
    return;
  }

  // 确认迁移
  console.log('\n⚠️  即将开始迁移密码...');
  console.log('按 Ctrl+C 取消，或等待 3 秒后自动开始...\n');

  await new Promise(resolve => setTimeout(resolve, 3000));

  // 开始迁移
  console.log('🔄 开始迁移...\n');

  let successCount = 0;
  let errorCount = 0;

  for (const user of users as User[]) {
    if (!user.password) {
      console.log(`⚠️  用户 ${user.username} 没有密码，跳过`);
      continue;
    }

    try {
      // 生成 bcrypt 哈希
      const passwordHash = await bcrypt.hash(user.password, SALT_ROUNDS);

      // 更新数据库
      const { error: updateError } = await supabase
        .from('users')
        .update({ password_hash: passwordHash })
        .eq('id', user.id);

      if (updateError) {
        console.error(`❌ 用户 ${user.username} 更新失败:`, updateError.message);
        errorCount++;
      } else {
        console.log(`✅ 用户 ${user.username} (${user.email || '无邮箱'}) 迁移成功`);
        successCount++;
      }
    } catch (err) {
      console.error(`❌ 用户 ${user.username} 处理失败:`, err);
      errorCount++;
    }
  }

  // 输出结果
  console.log('\n========================================');
  console.log('迁移完成!');
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${errorCount}`);
  console.log('========================================');

  if (successCount > 0) {
    console.log('\n📝 后续步骤:');
    console.log('1. 确认登录功能正常工作');
    console.log('2. 验证所有用户都能正常登录');
    console.log('3. (可选) 迁移成功后，可以删除 password 字段:');
    console.log('   ALTER TABLE users DROP COLUMN password;');
    console.log('   或将其重命名为 password_backup 作为备份');
  }
}

// 解析命令行参数
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const force = args.includes('--force');

// 执行迁移
migratePasswords(dryRun, force).catch(err => {
  console.error('脚本执行失败:', err);
  process.exit(1);
});
