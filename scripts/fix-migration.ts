import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// 需要修复的文件列表
const FILES_TO_FIX = [
  'src/app/api/admin/users/route.ts',
  'src/app/api/admin/users/[id]/points/route.ts',
  'src/app/api/admin/users/[id]/role/route.ts',
  'src/app/api/admin/users/[id]/disable/route.ts',
  'src/app/api/admin/levels/route.ts',
  'src/app/api/admin/levels/[level]/route.ts',
  'src/app/api/admin/levels/batch/route.ts',
  'src/app/api/admin/levels/[level]/history/route.ts',
  'src/app/api/admin/levels/defaults/route.ts',
  'src/app/api/admin/points/logs/route.ts',
  'src/app/api/admin/audit/route.ts',
  'src/app/api/admin/audit/[id]/approve/route.ts',
  'src/app/api/admin/audit/[id]/reject/route.ts',
  'src/app/api/admin/approve/route.ts',
  'src/app/api/admin/modules/route.ts',
  'src/app/api/admin/billing/config/route.ts',
  'src/app/api/admin/migrate-permissions/route.ts',
  'src/app/api/admin/stats/route.ts',
  'src/app/api/admin/stats/level-distribution/route.ts',
  'src/app/api/admin/stats/permissions/heatmap/route.ts',
  'src/app/api/admin/stats/revenue/route.ts',
  'src/app/api/admin/templates/route.ts',
  'src/app/api/admin/api-permissions/route.ts',
  'src/app/api/admin/permissions/preview/route.ts',
];

function fixFile(filePath: string): boolean {
  const fullPath = path.join(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  文件不存在: ${filePath}`);
    return false;
  }

  let content = fs.readFileSync(fullPath, 'utf8');

  // 检查是否需要修复
  if (!content.includes('withPermissionCheck')) {
    console.log(`⏭️  跳过未迁移文件: ${filePath}`);
    return false;
  }

  // 修复方法1：移除重复的导入
  content = content.replace(
    /(import { NextRequest } from 'next\/server';\n)(import { NextRequest } from 'next\/server';\n)/g,
    '$1'
  );

  // 修复方法2：修复函数结尾
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

  for (const method of methods) {
    // 查找这个方法的函数定义
    const methodRegex = new RegExp(
      `export const ${method} = withPermissionCheck\\(\\s*{[^}]*}\\s*,\\s*async \\(request: NextRequest, user: any\\) =>\\s*{`
    );

    if (methodRegex.test(content)) {
      console.log(`🔧 修复 ${filePath} - ${method}`);

      // 找到函数的开始位置
      const match = content.match(methodRegex);
      if (!match || match.index === undefined) continue;

      const startIndex = match.index;
      const startMarker = match[0];

      // 从函数开始位置开始，找到对应的闭合括号
      let bracketCount = 1;
      let endIndex = startIndex + startMarker.length;

      for (let i = endIndex; i < content.length; i++) {
        if (content[i] === '{') {
          bracketCount++;
        } else if (content[i] === '}') {
          bracketCount--;
          if (bracketCount === 0) {
            endIndex = i;
            break;
          }
        }
      }

      if (bracketCount === 0) {
        // 提取函数体
        const beforeFunction = content.substring(0, startIndex!);
        const functionBody = content.substring(startIndex! + startMarker.length, endIndex);
        const afterFunction = content.substring(endIndex + 1);

        // 检查函数体是否以})(request);结尾
        if (!functionBody.trim().endsWith('})(request);')) {
          // 构建新的函数
          const newFunction = `export const ${method} = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.access'] },
  async (request: NextRequest, user: any) => {
${functionBody}
  })(request);`;

          content = beforeFunction + newFunction + afterFunction;
        }
      }
    }
  }

  // 写入文件
  fs.writeFileSync(fullPath, content);
  console.log(`✅ 已修复: ${filePath}`);

  return true;
}

async function fixAll() {
  console.log('='.repeat(60));
  console.log('🔧 开始修复迁移后的文件');
  console.log('='.repeat(60));

  let success = 0;
  let failed = 0;

  for (const file of FILES_TO_FIX) {
    try {
      fixFile(file);
      success++;
    } catch (error) {
      console.error(`❌ 修复失败: ${file}`, error);
      failed++;
    }
  }

  console.log('='.repeat(60));
  console.log('📋 修复完成报告');
  console.log('='.repeat(60));
  console.log(`✅ 成功: ${success}`);
  console.log(`❌ 失败: ${failed}`);
  console.log('='.repeat(60));

  // 运行类型检查
  console.log('\n🔍 运行类型检查...');
  try {
    const { stdout, stderr } = await execAsync('npx tsc --noEmit 2>&1');
    if (stdout.includes('error TS')) {
      console.error('❌ 类型检查失败:');
      console.log(stdout);
    } else {
      console.log('✅ 类型检查通过');
    }
  } catch (error) {
    console.error('❌ 类型检查失败');
  }
}

fixAll().catch(console.error);
