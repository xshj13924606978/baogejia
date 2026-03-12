/**
 * 权限系统迁移脚本
 * 使用 Supabase 客户端执行 SQL 迁移
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 从环境变量获取配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('缺少数据库配置');
  console.error('请设置 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY 环境变量');
  process.exit(1);
}

// 创建 Supabase 客户端
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * 执行单个 SQL 语句
 */
async function executeSQL(sql) {
  try {
    // 使用 raw SQL 执行
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      throw error;
    }
    
    return { success: true, data };
  } catch (error) {
    console.error('SQL 执行失败:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * 执行迁移
 */
async function runMigration() {
  console.log('========================================');
  console.log('开始执行权限系统迁移');
  console.log('========================================\n');

  // 读取迁移文件
  const migrationFile = path.join(__dirname, 'migrations/04_permission_system.sql');
  
  if (!fs.existsSync(migrationFile)) {
    console.error(`迁移文件不存在: ${migrationFile}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationFile, 'utf8');

  // 分割 SQL 语句
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => {
      // 过滤掉注释和空语句
      const trimmed = s.trim();
      if (!trimmed || trimmed.startsWith('--') || trimmed.startsWith('/*')) {
        return false;
      }
      // 至少需要有一些关键字才认为是有效语句
      return /[CREATE|ALTER|INSERT|UPDATE|DELETE|DROP|SELECT|COMMENT|GRANT]/i.test(trimmed);
    });

  console.log(`共 ${statements.length} 条 SQL 语句\n`);

  let successCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < statements.length; i++) {
    const statement = statements[i];
    const preview = statement.substring(0, 80) + (statement.length > 80 ? '...' : '');
    
    process.stdout.write(`执行 ${i + 1}/${statements.length}: ${preview} ... `);

    try {
      // 直接使用 Supabase 的 REST API 执行 SQL
      const { data, error } = await supabase
        .from('migrations')
        .insert({
          name: `04_permission_system_${i}`,
          executed_at: new Date().toISOString()
        })
        .select();

      // 这个方法可能不适用，让我们尝试其他方式
      // 使用 PostgreSQL 的直接执行
      const result = await supabase.rpc('execute_sql', { 
        query: statement 
      });

      if (result.error) {
        throw result.error;
      }

      console.log('✅');
      successCount++;
    } catch (error) {
      console.log('❌');
      console.log(`   错误: ${error.message}`);
      errors.push({
        index: i + 1,
        statement: preview,
        error: error.message
      });
      errorCount++;
    }
  }

  console.log('\n========================================');
  console.log('迁移执行完成');
  console.log(`✅ 成功: ${successCount}`);
  console.log(`❌ 失败: ${errorCount}`);
  console.log('========================================');

  if (errors.length > 0) {
    console.log('\n错误详情:');
    errors.forEach(err => {
      console.log(`\n语句 ${err.index}:`);
      console.log(`  SQL: ${err.statement}`);
      console.log(`  错误: ${err.error}`);
    });
  }

  process.exit(errorCount > 0 ? 1 : 0);
}

// 执行迁移
runMigration().catch(error => {
  console.error('迁移执行异常:', error);
  process.exit(1);
});
