import fs from 'fs';
import path from 'path';

const FILES = [
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

function fixFile(filePath: string) {
  const fullPath = path.join(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) return;

  let content = fs.readFileSync(fullPath, 'utf8');

  // 查找所有 withPermissionCheck 函数
  const methodPattern =
    /export const (GET|POST|PUT|DELETE|PATCH) = withPermissionCheck\(\s*{[^}]*}\s*,\s*async \(request: NextRequest, user: any\) =>\s*\{/g;
  const matches = [...content.matchAll(methodPattern)];

  if (matches.length === 0) {
    console.log(`⏭️  跳过（没有withPermissionCheck）: ${filePath}`);
    return;
  }

  console.log(`🔧 修复 ${filePath} (${matches.length} 个函数)`);

  // 从后往前处理，避免索引变化
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const startIndex = match.index + match[0].length;

    // 找到对应的闭合括号
    let bracketCount = 1;
    let endIndex = startIndex;

    for (let j = startIndex; j < content.length; j++) {
      if (content[j] === '{') {
        bracketCount++;
      } else if (content[j] === '}') {
        bracketCount--;
        if (bracketCount === 0) {
          endIndex = j;
          break;
        }
      }
    }

    if (bracketCount !== 0) {
      console.log(`  ⚠️  无法找到闭合括号`);
      continue;
    }

    // 检查函数体后是否已经有 })(request);
    const afterFunction = content.substring(endIndex + 1);
    if (afterFunction.trim().startsWith('})(request);')) {
      console.log(`  ✅ 函数 ${i + 1} 已正确闭合`);
      continue;
    }

    // 修复：在 } 后添加 )(request);
    const beforeEnd = content.substring(0, endIndex + 1);
    const afterEnd = content.substring(endIndex + 1);

    content = beforeEnd + ')(request);' + afterEnd;
    console.log(`  ✅ 修复函数 ${i + 1} 的闭合`);
  }

  fs.writeFileSync(fullPath, content);
  console.log(`✅ 完成: ${filePath}\n`);
}

FILES.forEach(fixFile);
console.log('智能修复完成！');
