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

  // 修复格式错误：{ status: 401 }); 改为 status: 401
  content = content.replace(/\{ status: (\d+) \}\);/g, 'status: $1\n      );');
  content = content.replace(/\{ status: (\d+) \}\)/g, 'status: $1\n    )');

  // 修复其他类似的格式错误
  content = content.replace(/\{ (status: \d+) \}/g, '$1');

  // 写入文件
  if (content !== original) {
    fs.writeFileSync(fullPath, content);
    console.log(`✅ 修复: ${filePath}`);
  } else {
    console.log(`⏭️  跳过: ${filePath}`);
  }
}

console.log('开始修复返回格式错误...\n');
FILES.forEach(fixFile);
console.log('\n修复完成！');
