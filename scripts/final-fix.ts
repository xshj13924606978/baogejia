import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function fixAllFiles() {
  console.log('🚀 开始最终类型错误修复\n');

  const files = [
    'src/app/api/admin/approve/route.ts',
    'src/app/api/admin/audit/[id]/approve/route.ts',
    'src/app/api/admin/audit/route.ts',
    'src/app/api/admin/levels/route.ts',
    'src/app/api/admin/levels/[level]/route.ts',
    'src/app/api/admin/levels/batch/route.ts',
    'src/app/api/admin/levels/[level]/history/route.ts',
    'src/app/api/admin/levels/defaults/route.ts',
    'src/app/api/admin/migrate-permissions/route.ts',
    'src/app/api/admin/points/logs/route.ts',
    'src/app/api/admin/stats/level-distribution/route.ts',
    'src/app/api/admin/stats/permissions/heatmap/route.ts',
    'src/app/api/admin/stats/revenue/route.ts',
    'src/app/api/admin/stats/route.ts',
    'src/app/api/admin/templates/route.ts',
    'src/app/api/admin/api-permissions/route.ts',
    'src/app/api/admin/permissions/preview/route.ts',
    'src/app/api/admin/modules/route.ts',
    'src/app/api/admin/billing/config/route.ts',
    'src/app/api/admin/users/[id]/points/route.ts',
    'src/app/api/admin/users/[id]/role/route.ts',
    'src/app/api/admin/users/[id]/disable/route.ts',
  ];

  let fixedCount = 0;

  for (const filePath of files) {
    try {
      const result = fixFile(filePath);
      if (result) {
        fixedCount++;
      }
    } catch (error) {
      console.log(`❌ 处理失败 ${filePath}:`, error);
    }
  }

  console.log(`\n✅ 修复了 ${fixedCount} 个文件`);

  // 验证修复结果
  console.log('\n🔍 验证修复结果...');
  await verifyFix();
}

function fixFile(filePath: string): boolean {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    console.log(`⏭️  文件不存在: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;
  let modified = false;

  // 修复1: NextResponse.json 的错误格式
  // 错误: { error: '...' }, { status: 401 });
  // 正确: { error: '...', status: 401 }
  content = content.replace(
    /\{ error: ([^}]+) \},\s*\{ status: (\d+) \}\);/g,
    '{ error: $1, status: $2 }'
  );

  // 修复2: 单独的 status 行
  // 错误: { error: '...' }, { status: 401 }
  // 正确: { error: '...', status: 401 }
  content = content.replace(
    /\{ error: ([^}]+) \},\s*\{ status: (\d+) \}/g,
    '{ error: $1, status: $2 }'
  );

  // 修复3: 缺失的闭合括号（在文件末尾）
  // 查找模式：\n  } 应该是 \n  }\n});
  const lines = content.split('\n');
  const lastNonEmptyLineIndex = lines.findLastIndex(line => line.trim().length > 0);
  if (lastNonEmptyLineIndex >= 0) {
    const lastLine = lines[lastNonEmptyLineIndex];
    if (lastLine.trim() === '}' && !content.endsWith('});')) {
      lines[lastNonEmptyLineIndex] = lastLine + '\n});';
      content = lines.join('\n');
      modified = true;
    }
  }

  // 修复4: 多余的空行导致的 TS1128 错误
  // 在 export const 和函数体之间不应该有空行
  content = content.replace(
    /(export const \w+ = withPermissionCheck\(\s*\{[^}]*\},\s*async \([^)]+\) =>\s*\{)\n\n/g,
    '$1\n'
  );

  // 修复5: try-catch 块前的多余字符
  // 移除 try 前的意外字符
  content = content.replace(/\s+\)\s*try/g, ') {\n    try');

  // 修复6: 缺失的括号在 filter 等方法调用中
  // 错误: .startsWith('/*');
  // 正确: .startsWith('/*'));
  content = content.replace(
    /(\.startsWith\('\/\*'\);)/g,
    ".startsWith('/*'))"
  );

  if (content !== original) {
    fs.writeFileSync(fullPath, content);
    console.log(`✅ 已修复: ${filePath}`);
    return true;
  }

  return false;
}

async function verifyFix() {
  try {
    const { stdout, stderr } = await execAsync('npx tsc --noEmit', {
      timeout: 60000
    });

    if (stderr) {
      const errorLines = stderr.split('\n').filter((l: string) => l.includes('error TS'));
      const errorCount = errorLines.length;

      console.log(`\n📊 类型检查结果:`);
      console.log(`   剩余错误: ${errorCount}`);

      if (errorCount === 0) {
        console.log('\n🎉 恭喜！所有类型错误已修复！');
      } else {
        console.log(`\n⚠️  还有 ${errorCount} 个错误:`);
        errorLines.slice(0, 20).forEach((line: string) => console.log(`   ${line}`));
        if (errorCount > 20) {
          console.log(`   ... 还有 ${errorCount - 20} 个错误`);
        }
      }
    } else {
      console.log('\n🎉 恭喜！所有类型错误已修复！');
    }
  } catch (error: any) {
    const stderr = error.stderr || '';
    const errorLines = stderr.split('\n').filter((l: string) => l.includes('error TS'));
    const errorCount = errorLines.length;

    console.log(`\n📊 类型检查结果:`);
    console.log(`   剩余错误: ${errorCount}`);

    if (errorCount > 0) {
      console.log(`\n⚠️  还有 ${errorCount} 个错误:`);
      errorLines.slice(0, 20).forEach((line: string) => console.log(`   ${line}`));
    }
  }
}

fixAllFiles().catch(console.error);
