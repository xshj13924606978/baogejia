/**
 * 执行数据库迁移脚本
 * 用法：node scripts/run-migration.js <migration-file>
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 从环境变量获取配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('错误：缺少 Supabase 配置');
  console.error('请设置环境变量：NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('用法：node scripts/run-migration.js <migration-file>');
  console.error('示例：node scripts/run-migration.js database/migrations/005_product_duplicate_check.sql');
  process.exit(1);
}

// 读取迁移文件
const filePath = path.resolve(__dirname, '..', migrationFile);
if (!fs.existsSync(filePath)) {
  console.error(`错误：迁移文件不存在：${filePath}`);
  process.exit(1);
}

const sql = fs.readFileSync(filePath, 'utf-8');

// 执行迁移
async function runMigration() {
  console.log(`正在执行迁移：${migrationFile}`);
  console.log('-'.repeat(60));

  try {
    // 创建 Supabase 客户端
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
      },
    });

    // 使用 rpc 执行 SQL（需要创建一个 SQL 执行函数）
    // 或者直接使用 PostgreSQL 客户端

    // 分割 SQL 语句（按分号分割）
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`找到 ${statements.length} 条 SQL 语句`);

    // 执行每条语句
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      console.log(`\n执行语句 ${i + 1}/${statements.length}:`);
      console.log(statement.substring(0, 100) + (statement.length > 100 ? '...' : ''));

      // 注意：这里需要使用 PostgreSQL 客户端直接执行
      // Supabase JS 客户端不支持直接执行原始 SQL
      console.log('⚠️  警告：此脚本需要 PostgreSQL 客户端才能执行');
      console.log('建议：使用 Supabase Dashboard 的 SQL Editor 执行迁移文件');
    }

    console.log('\n' + '='.repeat(60));
    console.log('✅ 迁移文件已准备完成');
    console.log('请访问 Supabase Dashboard 的 SQL Editor 执行以下文件：');
    console.log(`  ${filePath}`);
  } catch (error) {
    console.error('❌ 迁移失败：', error.message);
    process.exit(1);
  }
}

runMigration();
