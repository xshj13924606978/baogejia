/**
 * 数据库迁移执行脚本
 * 用于执行 SQL 迁移文件
 */

const fs = require('fs');
const path = require('path');
const { getSupabaseClient } = require('../src/storage/database/supabase-client');

async function runMigration() {
  const migrationFile = process.argv[2];
  
  if (!migrationFile) {
    console.error('请指定迁移文件路径');
    console.error('用法: node scripts/run-migration.js <migration-file>');
    process.exit(1);
  }

  const filePath = path.resolve(__dirname, migrationFile);
  
  if (!fs.existsSync(filePath)) {
    console.error(`迁移文件不存在: ${filePath}`);
    process.exit(1);
  }

  console.log(`开始执行迁移: ${migrationFile}`);
  console.log('=====================================');

  try {
    // 读取 SQL 文件
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // 获取数据库客户端
    const supabase = getSupabaseClient();
    
    // 分割 SQL 语句（按分号分隔）
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`共 ${statements.length} 条 SQL 语句`);
    console.log('');

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const statementPreview = statement.substring(0, 100) + (statement.length > 100 ? '...' : '');
      
      try {
        const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement });
        
        if (error) {
          console.error(`❌ 语句 ${i + 1}/${statements.length} 失败:`);
          console.error(`   ${statementPreview}`);
          console.error(`   错误: ${error.message}`);
          errorCount++;
        } else {
          console.log(`✅ 语句 ${i + 1}/${statements.length} 成功`);
          successCount++;
        }
      } catch (err) {
        console.error(`❌ 语句 ${i + 1}/${statements.length} 失败:`);
        console.error(`   ${statementPreview}`);
        console.error(`   错误: ${err.message}`);
        errorCount++;
      }
    }

    console.log('');
    console.log('=====================================');
    console.log(`迁移完成: ${successCount} 成功, ${errorCount} 失败`);
    
    if (errorCount > 0) {
      console.log('⚠️  部分语句执行失败，请检查错误信息');
      process.exit(1);
    } else {
      console.log('✅ 迁移执行成功');
    }
  } catch (error) {
    console.error('❌ 迁移执行失败:');
    console.error(error);
    process.exit(1);
  }
}

runMigration();
