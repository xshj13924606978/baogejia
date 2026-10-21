import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const filesToFix = [
  'src/app/api/admin/approve/route.ts',
  'src/app/api/admin/migrate-permissions/route.ts',
  'src/app/api/admin/points/logs/route.ts',
  'src/app/api/admin/stats/level-distribution/route.ts',
  'src/app/api/admin/stats/permissions/heatmap/route.ts',
  'src/app/api/admin/stats/revenue/route.ts',
  'src/app/api/admin/stats/route.ts',
  'src/app/api/admin/templates/route.ts',
  'src/app/api/admin/users/[id]/disable/route.ts',
];

function fixFile(filePath: string): boolean {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const originalContent = content;

    // 修复模式1: 删除多余的 ');'
    content = content.replace(/\n\s*\);\s*\n/g, '\n');

    // 修复模式2: 删除多余的 '});'
    content = content.replace(/\n\s*\}\);\s*\n/g, '\n');

    // 修复模式3: 修复 setTimeout 的括号
    content = content.replace(
      /setTimeout\(resolve, 100\);\s*\n\s*\}/g,
      'setTimeout(resolve, 100));\n    }'
    );

    // 修复模式4: 删除空行前的多余闭合括号
    content = content.replace(/\n\s*\}\s*\n\s*\}/g, '\n  }\n}');

    // 修复模式5: 确保文件末尾有换行符
    if (!content.endsWith('\n')) {
      content += '\n';
    }

    if (content !== originalContent) {
      fs.writeFileSync(filePath, content, 'utf-8');
      console.log(`✅ 已修复: ${filePath}`);
      return true;
    } else {
      console.log(`⏭️  无需修复: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ 修复失败 ${filePath}:`, error);
    return false;
  }
}

async function main() {
  console.log('🚀 开始手动修复 TypeScript 错误\n');

  let fixedCount = 0;
  for (const file of filesToFix) {
    if (fixFile(file)) {
      fixedCount++;
    }
  }

  console.log(`\n📊 修复统计:`);
  console.log(`   已修复: ${fixedCount} 个文件`);
  console.log(`   无需修复: ${filesToFix.length - fixedCount} 个文件`);

  console.log('\n🔍 验证修复结果...');
  try {
    const output = execSync('npx tsc --noEmit 2>&1', { encoding: 'utf-8' });
    console.log('✅ 没有类型错误！');
  } catch (error: any) {
    const stderr = error.stderr || error.stdout || '';
    const errorLines = stderr.split('\n').filter((l: string) => l.includes('error TS'));
    const errorCount = errorLines.length;

    console.log(`\n📊 类型检查结果:`);
    console.log(`   剩余错误: ${errorCount}`);

    if (errorCount > 0) {
      console.log(`\n⚠️  还有 ${errorCount} 个错误:`);
      errorLines.slice(0, 30).forEach((line: string) => console.log(`   ${line}`));
    }
  }
}

main().catch(console.error);
