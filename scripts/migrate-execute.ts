#!/usr/bin/env tsx
/**
 * 数据库迁移执行脚本 (通过 Supabase Management API)
 * 
 * 前置要求:
 *   1. 设置 SUPABASE_ACCESS_TOKEN 环境变量 (从 Supabase Dashboard 获取)
 *   2. 或者在 Supabase Dashboard > Account > Access Tokens 创建
 * 
 * 使用方法:
 *   pnpm tsx scripts/migrate-execute.ts --file 04_permission_system.sql
 *   pnpm tsx scripts/migrate-execute.ts --all
 *   pnpm tsx scripts/migrate-execute.ts --dry-run
 */

import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

interface MigrationResult {
  file: string;
  success: boolean;
  message?: string;
}

class SupabaseMigrator {
  private projectRef: string;
  private accessToken: string | undefined;
  private migrationsDir: string;
  private dryRun: boolean;

  constructor() {
    this.migrationsDir = path.join(__dirname, 'migrations');
    this.dryRun = process.argv.includes('--dry-run');
    
    // 从 NEXT_PUBLIC_SUPABASE_URL 提取项目引用
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const match = supabaseUrl.match(/https:\/\/([a-z]+)\.supabase\.co/);
    this.projectRef = match ? match[1] : '';
    
    if (!this.projectRef) {
      throw new Error('无法从 NEXT_PUBLIC_SUPABASE_URL 提取项目引用');
    }
    
    this.accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  }

  /**
   * 执行 SQL (通过 Supabase Management API)
   */
  private async executeSql(sql: string): Promise<{ success: boolean; error?: string }> {
    if (!this.accessToken) {
      return { 
        success: false, 
        error: '未设置 SUPABASE_ACCESS_TOKEN。请在 .env.local 中设置或在 Supabase Dashboard 创建: https://supabase.com/dashboard/account/tokens' 
      };
    }

    try {
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${this.projectRef}/database/query`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ query: sql }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 分割 SQL 文件为独立语句
   */
  private splitSqlStatements(content: string): string[] {
    const statements: string[] = [];
    let current = '';
    let inFunction = false;

    const lines = content.split('\n');
    
    for (const line of lines) {
      // 检测函数开始
      if (line.includes('$$ LANGUAGE')) {
        inFunction = true;
      }
      
      current += line + '\n';
      
      // 检测函数结束
      if (inFunction && line.trim() === '$$;') {
        if (current.trim()) statements.push(current.trim());
        current = '';
        inFunction = false;
        continue;
      }
      
      // 普通语句结束
      if (!inFunction && line.trim().endsWith(';')) {
        if (current.trim()) statements.push(current.trim());
        current = '';
      }
    }

    if (current.trim()) {
      statements.push(current.trim());
    }

    return statements.filter(s => s.length > 0 && !s.startsWith('--'));
  }

  /**
   * 执行迁移文件
   */
  async runMigration(filename: string): Promise<MigrationResult> {
    const filePath = path.join(this.migrationsDir, filename);
    
    if (!fs.existsSync(filePath)) {
      return { file: filename, success: false, message: '文件不存在' };
    }

    console.log(`\n📄 执行迁移: ${filename}`);

    const content = fs.readFileSync(filePath, 'utf-8');
    const statements = this.splitSqlStatements(content);
    
    console.log(`   发现 ${statements.length} 条 SQL 语句`);

    if (this.dryRun) {
      console.log('   🔍 [DRY-RUN] 跳过实际执行');
      return { file: filename, success: true, message: 'Dry run' };
    }

    // 执行整个 SQL 文件
    const result = await this.executeSql(content);
    
    if (result.success) {
      console.log('   ✅ 成功');
    } else {
      console.log(`   ❌ 失败: ${result.error}`);
    }

    return { 
      file: filename, 
      success: result.success, 
      message: result.error 
    };
  }

  /**
   * 运行所有迁移
   */
  async runAll(): Promise<void> {
    console.log('🚀 Supabase 数据库迁移工具');
    console.log('='.repeat(60));
    console.log(`📍 项目引用: ${this.projectRef}`);
    
    if (this.dryRun) {
      console.log('⚠️  干运行模式');
    }
    
    if (!this.accessToken && !this.dryRun) {
      console.log('\n❌ 未设置 SUPABASE_ACCESS_TOKEN');
      console.log('\n📚 如何获取 Access Token:');
      console.log('   1. 访问 https://supabase.com/dashboard/account/tokens');
      console.log('   2. 点击 "Generate new token"');
      console.log('   3. 复制 token 并添加到 .env.local:');
      console.log('      SUPABASE_ACCESS_TOKEN=your_token_here');
      console.log('\n或者使用 psql 命令行:');
      console.log(`   psql "${process.env.DATABASE_URL}" -f scripts/migrations/04_permission_system.sql`);
      process.exit(1);
    }

    const files = fs.readdirSync(this.migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    const results: MigrationResult[] = [];

    for (const file of files) {
      const result = await this.runMigration(file);
      results.push(result);
    }

    // 摘要
    console.log('\n' + '='.repeat(60));
    console.log('📊 迁移摘要:');
    const success = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`   ✅ 成功: ${success}`);
    console.log(`   ❌ 失败: ${failed}`);
    
    if (failed > 0) {
      process.exit(1);
    }
  }

  /**
   * 运行指定文件
   */
  async runFile(filename: string): Promise<void> {
    console.log('🚀 Supabase 数据库迁移工具');
    console.log('='.repeat(60));
    console.log(`📍 项目引用: ${this.projectRef}`);
    console.log(`📄 指定文件: ${filename}`);

    if (this.dryRun) {
      console.log('⚠️  干运行模式');
    }

    if (!this.accessToken && !this.dryRun) {
      console.log('\n❌ 未设置 SUPABASE_ACCESS_TOKEN');
      console.log('\n请使用以下方式之一执行迁移:');
      console.log('\n方式1: 使用 psql (推荐)');
      console.log(`   psql "${process.env.DATABASE_URL}" -f scripts/migrations/${filename}`);
      console.log('\n方式2: 使用 Supabase Dashboard SQL Editor');
      console.log(`   https://supabase.com/dashboard/project/${this.projectRef}/sql`);
      process.exit(1);
    }

    const result = await this.runMigration(filename);
    
    if (!result.success) {
      console.log('\n❌ 迁移失败');
      process.exit(1);
    }
    
    console.log('\n✅ 迁移成功');
  }
}

// 主程序
async function main() {
  const migrator = new SupabaseMigrator();
  
  if (process.argv.includes('--all')) {
    await migrator.runAll();
  } else {
    const fileIndex = process.argv.indexOf('--file');
    if (fileIndex !== -1 && process.argv[fileIndex + 1]) {
      await migrator.runFile(process.argv[fileIndex + 1]);
    } else {
      console.log('用法:');
      console.log('  pnpm tsx scripts/migrate-execute.ts --file <filename.sql>  执行指定文件');
      console.log('  pnpm tsx scripts/migrate-execute.ts --all                  执行所有迁移');
      console.log('  pnpm tsx scripts/migrate-execute.ts --dry-run --file ...  干运行模式');
    }
  }
}

main().catch(console.error);
