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

  // 修复重复导入
  content = content.replace(
    /import { NextRequest } from 'next\/server';\nimport { withPermissionCheck } from '@\/lib\/permission-check';\nimport { NextRequest, NextResponse } from 'next\/server';/g,
    "import { NextRequest, NextResponse } from 'next/server';\nimport { withPermissionCheck } from '@/lib/permission-check';"
  );

  // 修复函数结尾
  // 查找所有以空行+两个空格+}结尾的模式，替换为 })(request);
  content = content.replace(/\n  }$/gm, '\n  })(request);');

  // 但要确保不替换已经是 })(request); 的情况
  content = content.replace(/}\)\(request\);\n  }\)\(request\);/g, '})(request);');

  fs.writeFileSync(fullPath, content);
  console.log(`✅ 修复: ${filePath}`);
}

FILES.forEach(fixFile);
console.log('批量修复完成！');
