#!/usr/bin/env tsx
/**
 * 数据库迁移执行脚本
 * 
 * 使用方法:
 *   pnpm tsx scripts/run-migrations.ts              # 干运行模式（查看将执行的迁移）
 *   pnpm tsx scripts/run-migrations.ts --execute    # 实际执行迁移
 *   pnpm tsx scripts/run-migrations.ts --file 04_permission_system.sql --execute
 * 
 * 注意: 由于 Supabase 不支持直接执行 DDL，此脚本会:
 *   1. 在干运行模式下显示需要执行的 SQL
 *   2. 提供在 Supabase Dashboard 执行的指导
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// 加载环境变量
dotenv.config({ path: '.env.local' });

interface MigrationInfo {
  file: string;
  content: string;
  size: number;
  checksum: string;
}

class MigrationRunner {
  private migrationsDir: string;
  private shouldExecute: boolean;
  private specificFile: string | null;

  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
    this.shouldExecute = process.argv.includes('--execute');
    
    const fileIndex = process.argv.indexOf('--file');
    this.specificFile = fileIndex !== -1 ? process.argv[fileIndex + 1] : null;
  }

  /**
   * 计算文件校验和
   */
  private calculateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * 获取所有迁移文件
   */
  private getMigrationFiles(): string[] {
    return fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();
  }

  /**
   * 读取迁移文件信息
   */
  private readMigration(filename: string): MigrationInfo {
    const filePath = path.join(this.migrationsDir, filename);
    const content = fs.readFileSync(filePath, 'utf-8');
    
    return {
      file: filename,
      content,
      size: content.length,
      checksum: this.calculateChecksum(content)
    };
  }

  /**
   * 打印迁移内容摘要
   */
  private printMigrationSummary(migration: MigrationInfo): void {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📄 文件: ${migration.file}`);
    console.log(`📊 大小: ${migration.size} 字节`);
    console.log(`🔐 校验和: ${migration.checksum.substring(0, 16)}...`);
    console.log(`${'='.repeat(60)}`);
    
    // 提取关键 SQL 语句
    const lines = migration.content.split('\n');
    const statements: string[] = [];
    let currentStatement = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('--') || trimmed === '') continue;
      
      currentStatement += ' ' + trimmed;
      if (trimmed.endsWith(';')) {
        const stmt = currentStatement.trim();
        if (stmt.startsWith('CREATE TABLE')) {
          const match = stmt.match(/CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(\w+)/i);
          if (match) statements.push(`📋 创建表: ${match[1]}`);
        } else if (stmt.startsWith('CREATE INDEX')) {
          const match = stmt.match(/CREATE INDEX\s+(\w+)/i);
          if (match) statements.push(`📑 创建索引: ${match[1]}`);
        } else if (stmt.startsWith('INSERT INTO')) {
          const match = stmt.match(/INSERT INTO\s+(\w+)/i);
          if (match) statements.push(`📝 插入数据: ${match[1]}`);
        } else if (stmt.startsWith('CREATE TRIGGER')) {
          const match = stmt.match(/CREATE TRIGGER\s+(\w+)/i);
          if (match) statements.push(`⚡ 创建触发器: ${match[1]}`);
        } else if (stmt.startsWith('CREATE OR REPLACE FUNCTION')) {
          const match = stmt.match(/CREATE OR REPLACE FUNCTION\s+(\w+)/i);
          if (match) statements.push(`⚙️  创建函数: ${match[1]}`);
        }
        currentStatement = '';
      }
    }
    
    if (statements.length > 0) {
      console.log('\n操作摘要:');
      statements.forEach(s => console.log(`  ${s}`));
    }
  }

  /**
   * 运行迁移
   */
  async run(): Promise<void> {
    console.log('🚀 数据库迁移工具');
    console.log('='.repeat(60));
    
    if (!this.shouldExecute) {
      console.log('⚠️  干运行模式 (显示迁移内容，不实际执行)');
      console.log('💡 使用 --execute 参数来执行迁移');
    } else {
      console.log('⚡ 执行模式');
    }

    const files = this.specificFile 
      ? [this.specificFile]
      : this.getMigrationFiles();

    console.log(`\n📋 发现 ${files.length} 个迁移文件`);

    for (const file of files) {
      if (!fs.existsSync(path.join(this.migrationsDir, file))) {
        console.error(`\n❌ 文件不存在: ${file}`);
        continue;
      }

      const migration = this.readMigration(file);
      this.printMigrationSummary(migration);

      if (this.shouldExecute) {
        console.log('\n⏳ 正在执行迁移...');
        console.log('\n⚠️  Supabase 不支持通过 REST API 直接执行 DDL');
        console.log('请在 Supabase Dashboard 的 SQL Editor 中执行此迁移:\n');
        console.log('🔗 Supabase Dashboard:');
        console.log(`   https://supabase.com/dashboard/project/tjbnjrcgmyiwudqptfhc/sql`);
        console.log('\n或者使用 psql 命令行工具:');
        console.log(`   psql "${process.env.DATABASE_URL}" -f scripts/migrations/${file}`);
        
        // 输出 SQL 内容到临时文件供复制
        const tempFile = `/tmp/migration_${Date.now()}.sql`;
        fs.writeFileSync(tempFile, migration.content);
        console.log(`\n📄 SQL 内容已保存到: ${tempFile}`);
      } else {
        console.log('\n💡 要执行此迁移，请运行:');
        console.log(`   pnpm tsx scripts/run-migrations.ts --file ${file} --execute`);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log('✨ 完成！');
    
    if (!this.shouldExecute) {
      console.log('\n📚 执行所有迁移:');
      console.log('   pnpm tsx scripts/run-migrations.ts --execute');
    }
  }
}

// 执行迁移
const runner = new MigrationRunner();
runner.run();
