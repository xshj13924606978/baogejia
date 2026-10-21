import fs from 'fs';
import path from 'path';

const FILES = [
  'src/app/api/admin/migrate-permissions/route.ts',
  'src/app/api/admin/points/logs/route.ts',
  'src/app/api/admin/stats/level-distribution/route.ts',
  'src/app/api/admin/stats/permissions/heatmap/route.ts',
  'src/app/api/admin/stats/revenue/route.ts',
];

function fixFile(filePath: string) {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) return;

  let content = fs.readFileSync(fullPath, 'utf8');

  // 修复缺少的闭合括号
  // 模式：.startsWith('/*'); 应该是 .startsWith('/*')));
  content = content.replace(/\.startsWith\('\/\*'\);/g, ".startsWith('/*')));");

  // 修复类似的模式
  content = content.replace(/\.startsWith\('([^']*)'\);/g, ".startsWith('$1'));");

  // 写入文件
  fs.writeFileSync(fullPath, content);
  console.log(`✅ 修复: ${filePath}`);
}

console.log('开始修复缺失括号...\n');
FILES.forEach(fixFile);
console.log('\n修复完成！');
