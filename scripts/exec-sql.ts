#!/usr/bin/env tsx
/**
 * 执行指定 SQL 文件 - 通过 pg 驱动直连 Supabase PostgreSQL
 * 用法: pnpm tsx scripts/exec-sql.ts <sql-file-path>
 */
import { Client } from 'pg';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function main() {
  const sqlFile = process.argv[2];
  if (!sqlFile) {
    console.error('用法: pnpm tsx scripts/exec-sql.ts <sql-file-path>');
    process.exit(1);
  }

  if (!fs.existsSync(sqlFile)) {
    console.error(`文件不存在: ${sqlFile}`);
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('缺少 DATABASE_URL 环境变量');
    process.exit(1);
  }

  const sql = fs.readFileSync(sqlFile, 'utf-8');
  console.log(`执行 SQL 文件: ${sqlFile} (${sql.length} 字节)`);

  // 强制使用 IPv4：替换主机名中的 IPv6 地址
  let connStr = databaseUrl;
  // 解析连接字符串，获取 host
  const urlMatch = databaseUrl.match(/(postgresql:\/\/[^@]+@)([^:]+)(:.*)/);
  let resolvedHost = '';
  if (urlMatch) {
    const [, prefix, host, suffix] = urlMatch;
    try {
      // 尝试 DNS 解析，优先 IPv4
      const dns = require('dns');
      const { promisify } = require('util');
      const lookup = promisify(dns.lookup);
      const result = await lookup(host, { family: 4 });
      resolvedHost = result.address;
      connStr = `${prefix}${resolvedHost}${suffix}`;
      console.log(`DNS 解析: ${host} -> ${resolvedHost} (IPv4)`);
    } catch {
      // 如果 DNS 解析失败，使用 127.0.0.1 可能不对，保持原样
      console.log(`DNS 解析失败，使用原始主机名: ${host}`);
    }
  }

  const client = new Client({
    connectionString: connStr,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log('数据库连接成功');

    await client.query(sql);
    console.log('SQL 执行成功');
  } catch (error: any) {
    console.error('SQL 执行失败:', error.message);

    // 如果是 "已存在" 的错误，仍然标记为成功
    if (error.message?.includes('already exists') || error.code === '42P07') {
      console.log('提示: 表/索引已存在，迁移已跳过');
    } else {
      process.exit(1);
    }
  } finally {
    await client.end();
  }
}

main();
