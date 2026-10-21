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
  const lines = content.split('\n');

  // 找到文件的最后一行
  const lastLine = lines[lines.length - 1].trim();

  // 如果最后一行是 }，替换为 });
  if (lastLine === '}') {
    lines[lines.length - 1] = '});';
    content = lines.join('\n');
    fs.writeFileSync(fullPath, content);
    console.log(`✅ 修复: ${filePath}`);
  } else if (lastLine.endsWith('});')) {
    console.log(`⏭️  跳过（已正确闭合）: ${filePath}`);
  } else {
    console.log(`⚠️  未知状态: ${filePath} (${lastLine})`);
  }
}

FILES.forEach(fixFile);
console.log('最终闭合修复完成！');
