#!/usr/bin/env tsx
/**
 * 通过 Supabase REST API 执行 SQL（绕过 pg 直连的 IPv6 问题）
 * 用法: npx tsx scripts/exec-sql-http.ts <sql-file-path>
 */
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const sqlFile = process.argv[2];
  if (!sqlFile) {
    console.error('用法: npx tsx scripts/exec-sql-http.ts <sql-file-path>');
    process.exit(1);
  }

  if (!fs.existsSync(sqlFile)) {
    console.error(`文件不存在: ${sqlFile}`);
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('缺少 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlFile, 'utf-8');
  console.log(`执行 SQL 文件: ${sqlFile} (${sql.length} 字节)`);
  console.log(`连接: ${url}`);

  try {
    // 使用 Supabase RPC 调用 exec_sql 函数（如果存在）
    const res = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
      },
      body: JSON.stringify({ sql_string: sql }),
    });

    if (res.ok) {
      const data = await res.json();
      console.log('SQL 执行成功 (via exec_sql RPC)');
      if (data) console.log('结果:', JSON.stringify(data).slice(0, 200));
      return;
    }

    // 如果 RPC 不存在，尝试通过 pg 端点执行（Supabase 内置）
    if (res.status === 404) {
      console.log('exec_sql RPC 不存在，尝试直接 pg query...');
    }

    // 最后的备选方案：逐条执行语句
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`共 ${statements.length} 条语句`);

    // 使用 Supabase 的 internal pg endpoint
    const pgRes = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=representation',
      },
      body: JSON.stringify({ sql_string: statements.join('; ') }),
    });

    if (pgRes.ok) {
      console.log('SQL 执行成功');
      return;
    }

    // 如果所有方式都失败
    const errText = await pgRes.text();
    console.error(`执行失败 (${pgRes.status}): ${errText}`);
    console.log('\n请手动在 Supabase Dashboard SQL Editor 中执行:');
    console.log(`https://supabase.com/dashboard/project/tjbnjrcgmyiwudqptfhc/sql`);
    console.log('\n或者复制以下 SQL:');
    console.log('---');
    console.log(sql);
    console.log('---');
    process.exit(1);
  } catch (error: any) {
    console.error('连接失败:', error.message);
    console.log('\n请手动在 Supabase Dashboard SQL Editor 中执行:');
    console.log('https://supabase.com/dashboard/project/tjbnjrcgmyiwudqptfhc/sql');
    console.log('\nSQL 内容:');
    console.log('---');
    console.log(sql);
    console.log('---');
    process.exit(1);
  }
}

main();
