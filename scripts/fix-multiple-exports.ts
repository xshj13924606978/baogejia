import fs from 'fs';
import path from 'path';

const FILES = [
  'src/app/api/admin/users/[id]/points/route.ts',
  'src/app/api/admin/users/[id]/role/route.ts',
  'src/app/api/admin/users/[id]/disable/route.ts',
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

function fixFile(filePath: string) {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) return;

  let content = fs.readFileSync(fullPath, 'utf8');
  const original = content;

  // 查找所有 export const XX = withPermissionCheck 的位置
  const exportPattern = /export const (GET|POST|PUT|DELETE|PATCH) = withPermissionCheck\(/g;
  const matches = [...content.matchAll(exportPattern)];

  console.log(`🔧 处理 ${filePath} (${matches.length} 个导出函数)`);

  // 从后往前处理，避免索引变化
  let modifications = 0;

  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const startIndex = match.index + match[0].length;

    // 如果不是最后一个函数，需要找到这个函数的结束位置
    if (i < matches.length - 1) {
      const nextMatch = matches[i + 1];
      const endIndex = nextMatch.index;

      // 检查结束位置前是否已经有 }); 或 })
      const beforeNext = content.substring(endIndex - 10, endIndex);

      if (!beforeNext.includes('});') && !beforeNext.includes('})')) {
        // 在函数结束和下一个函数开始之间添加 }); 和空行
        content = content.substring(0, endIndex) + '  });\n\n' + content.substring(endIndex);
        modifications++;
        console.log(`  ✅ 修复函数 ${i + 1} 的闭合`);
      }
    }
  }

  // 处理文件末尾
  if (matches.length > 0) {
    content = content.trimRight();
    if (!content.endsWith('});')) {
      if (content.endsWith('}')) {
        content = content.slice(0, -1) + '});';
      } else {
        content += '});';
      }
      modifications++;
      console.log(`  ✅ 修复文件末尾的闭合`);
    }
  }

  // 写入文件
  if (modifications > 0 || content !== original) {
    fs.writeFileSync(fullPath, content);
    console.log(`✅ 已修复: ${filePath} (${modifications} 处修改)`);
  } else {
    console.log(`⏭️  跳过: ${filePath}`);
  }
}

console.log('开始修复所有多导出函数文件...\n');
FILES.forEach(fixFile);
console.log('\n修复完成！');
