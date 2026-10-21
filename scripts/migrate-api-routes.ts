import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// API路由分类（按风险等级）
const API_ROUTES = {
  // 🟢 低风险 - 用户管理相关
  user: [
    'src/app/api/admin/users/route.ts',
    'src/app/api/admin/users/[id]/points/route.ts',
    'src/app/api/admin/users/[id]/role/route.ts',
    'src/app/api/admin/users/[id]/disable/route.ts',
  ],

  // 🟢 低风险 - 积分等级相关
  points: [
    'src/app/api/admin/levels/route.ts',
    'src/app/api/admin/levels/[level]/route.ts',
    'src/app/api/admin/levels/batch/route.ts',
    'src/app/api/admin/levels/[level]/history/route.ts',
    'src/app/api/admin/levels/defaults/route.ts',
    'src/app/api/admin/points/logs/route.ts',
  ],

  // 🟡 中等风险 - 产品管理
  product: [
    // (产品API暂时跳过，因为目前只有demo接口)
  ],

  // 🟡 中等风险 - 报价管理
  quote: [
    // (报价API暂时跳过，因为目前只有demo接口)
  ],

  // 🟡 中等风险 - 审核管理
  audit: [
    'src/app/api/admin/audit/route.ts',
    'src/app/api/admin/audit/[id]/approve/route.ts',
    'src/app/api/admin/audit/[id]/reject/route.ts',
    'src/app/api/admin/approve/route.ts',
  ],

  // 🔴 高风险 - 系统管理
  system: [
    'src/app/api/admin/modules/route.ts',
    'src/app/api/admin/billing/config/route.ts',
    'src/app/api/admin/migrate-permissions/route.ts',
    'src/app/api/admin/init-test-users/route.ts',
  ],

  // 🔴 高风险 - 统计数据
  stats: [
    'src/app/api/admin/stats/route.ts',
    'src/app/api/admin/stats/level-distribution/route.ts',
    'src/app/api/admin/stats/permissions/heatmap/route.ts',
    'src/app/api/admin/stats/revenue/route.ts',
  ],

  // 🔴 高风险 - 模板和权限
  templates: [
    'src/app/api/admin/templates/route.ts',
    'src/app/api/admin/api-permissions/route.ts',
    'src/app/api/admin/permissions/preview/route.ts',
  ],
};

// 权限映射配置
const PERMISSION_MAP: Record<string, string> = {
  // 用户管理
  'admin/users/route.ts:GET': 'user.view',
  'admin/users/route.ts:POST': 'user.create',
  'admin/users/[id]/points/route.ts:POST': 'user.points.edit',
  'admin/users/[id]/role/route.ts:PUT': 'user.role.edit',
  'admin/users/[id]/disable/route.ts:POST': 'user.disable',

  // 积分等级
  'admin/levels/route.ts:GET': 'admin.points.view',
  'admin/levels/route.ts:POST': 'admin.points.create',
  'admin/levels/route.ts:PUT': 'admin.points.edit',
  'admin/levels/[level]/route.ts:GET': 'admin.points.view',
  'admin/levels/[level]/route.ts:PUT': 'admin.points.edit',
  'admin/levels/batch/route.ts:POST': 'admin.points.batch',
  'admin/levels/[level]/history/route.ts:GET': 'admin.points.history',
  'admin/levels/defaults/route.ts:GET': 'admin.points.defaults',
  'admin/levels/defaults/route.ts:POST': 'admin.points.defaults',
  'admin/points/logs/route.ts:GET': 'admin.points.logs',

  // 审核管理
  'admin/audit/route.ts:GET': 'admin.audit.view',
  'admin/audit/[id]/approve/route.ts:POST': 'admin.audit.approve',
  'admin/audit/[id]/reject/route.ts:POST': 'admin.audit.reject',
  'admin/approve/route.ts:POST': 'admin.audit.approve',

  // 系统管理
  'admin/modules/route.ts:GET': 'admin.modules.view',
  'admin/modules/route.ts:POST': 'admin.modules.edit',
  'admin/billing/config/route.ts:GET': 'admin.billing.view',
  'admin/billing/config/route.ts:PUT': 'admin.billing.edit',
  'admin/migrate-permissions/route.ts:POST': 'admin.permissions.migrate',
  'admin/init-test-users/route.ts:POST': 'admin.users.init',

  // 统计数据
  'admin/stats/route.ts:GET': 'admin.stats.view',
  'admin/stats/level-distribution/route.ts:GET': 'admin.stats.view',
  'admin/stats/permissions/heatmap/route.ts:GET': 'admin.stats.view',
  'admin/stats/revenue/route.ts:GET': 'admin.stats.revenue',

  // 模板和权限
  'admin/templates/route.ts:GET': 'admin.templates.view',
  'admin/templates/route.ts:POST': 'admin.templates.edit',
  'admin/api-permissions/route.ts:GET': 'admin.permissions.view',
  'admin/permissions/preview/route.ts:GET': 'admin.permissions.view',
};

// 特殊权限配置（需要额外检查）
const SPECIAL_CONFIG: Record<string, any> = {
  'admin/levels/batch/route.ts:POST': { minLevel: 4, roles: ['super_admin'] },
  'admin/migrate-permissions/route.ts:POST': { minLevel: 5, roles: ['super_admin'] },
  'admin/init-test-users/route.ts:POST': { minLevel: 5, roles: ['super_admin'] },
};

async function migrateFile(filePath: string): Promise<boolean> {
  const fullPath = path.join(process.cwd(), filePath);

  if (!fs.existsSync(fullPath)) {
    console.log(`⚠️  跳过不存在文件: ${filePath}`);
    return false;
  }

  // 读取文件内容
  let content = fs.readFileSync(fullPath, 'utf8');

  // 检查是否已迁移（排除demo和permission-test等测试接口）
  if (
    (content.includes('withPermissionCheck') || content.includes('checkPermission')) &&
    !filePath.includes('demo') &&
    !filePath.includes('test')
  ) {
    console.log(`✅ 已迁移，跳过: ${filePath}`);
    return true;
  }

  // 跳过测试接口和demo接口
  if (filePath.includes('demo') || filePath.includes('test')) {
    console.log(`⏭️  跳过测试接口: ${filePath}`);
    return false;
  }

  // 获取相对路径用于权限映射
  const relativePath = filePath.replace('src/app/api/', '');

  // 查找所有 HTTP 方法
  const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  let modified = false;

  for (const method of methods) {
    // 检查是否有该方法的导出
    const methodRegex = new RegExp(
      `export\\s+(?:async\\s+)?function\\s+${method}\\s*\\([^)]*\\)`,
      'g'
    );
    const constMethodRegex = new RegExp(
      `export\\s+const\\s+${method}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>`,
      'g'
    );

    if (methodRegex.test(content) || constMethodRegex.test(content)) {
      // 获取该API需要的权限
      const permissionKey = `${relativePath}:${method}`;
      let permission = PERMISSION_MAP[permissionKey];
      let specialConfig = SPECIAL_CONFIG[permissionKey];

      if (!permission && !specialConfig) {
        console.log(`⚠️  未找到权限配置: ${permissionKey}，使用默认权限 'admin.access'`);
        permission = 'admin.access';
      }

      console.log(`🔄 迁移 ${filePath} - ${method} (权限: ${permission || '自定义'})`);

      // 构建包装器参数
      let wrapperOptions = '{}';
      let wrapperType = 'withPermissionCheck';

      if (specialConfig) {
        wrapperOptions = JSON.stringify(specialConfig);
        wrapperType = 'withPermissionCheck';
      } else if (permission) {
        // 检查是否需要登录
        if (permission.startsWith('user.') || permission.startsWith('admin.')) {
          wrapperOptions = `{ requiresAuth: true, permissions: ['${permission}'] }`;
        } else {
          wrapperOptions = `{ permissions: ['${permission}'] }`;
        }
      }

      // 替换函数定义
      const newFunction = `
export const ${method} = ${wrapperType}(
  ${wrapperOptions},
  async (request: NextRequest, user: any) => {
`;

      // 替换 export async function
      content = content.replace(
        new RegExp(`export\\s+async\\s+function\\s+${method}\\s*\\([^)]*\\)\\s*{`),
        newFunction
      );

      // 替换 export const
      content = content.replace(
        new RegExp(`export\\s+const\\s+${method}\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>\\s*{`),
        newFunction
      );

      modified = true;
    }
  }

  if (modified) {
    // 添加导入语句（如果还没有）
    if (!content.includes('@/lib/permission-check')) {
      content = `import { withPermissionCheck } from '@/lib/permission-check';\n${content}`;
    }

    // 添加 NextRequest 导入（如果还没有）
    if (!content.includes('import { NextRequest }')) {
      content = `import { NextRequest } from 'next/server';\n${content}`;
    }

    // 写入文件
    fs.writeFileSync(fullPath, content);
    console.log(`✅ 已更新: ${filePath}`);

    // 格式化代码
    try {
      await execAsync(`npx prettier --write ${fullPath}`);
    } catch (error) {
      console.log(`⚠️  格式化失败: ${filePath}`);
    }

    return true;
  }

  console.log(`⏭️  无变化: ${filePath}`);
  return false;
}

async function migrateBatch(category: keyof typeof API_ROUTES) {
  console.log(`\n📦 开始迁移 ${category} 模块 (${API_ROUTES[category].length} 个文件)\n`);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (const file of API_ROUTES[category]) {
    try {
      const result = await migrateFile(file);
      if (result) {
        success++;
      } else {
        skipped++;
      }
    } catch (error) {
      console.error(`❌ 迁移失败: ${file}`, error);
      failed++;
    }
  }

  console.log(`\n📊 ${category} 模块迁移完成:`);
  console.log(`   ✅ 成功: ${success}`);
  console.log(`   ⏭️  跳过: ${skipped}`);
  console.log(`   ❌ 失败: ${failed}\n`);

  return { success, failed, skipped };
}

async function migrateAll() {
  console.log('='.repeat(60));
  console.log('🚀 开始批量迁移所有API路由');
  console.log('='.repeat(60));

  const results: Record<string, any> = {};

  // 按风险等级迁移
  const categories = ['user', 'points', 'audit', 'system', 'stats', 'templates'];

  for (const category of categories) {
    if (API_ROUTES[category as keyof typeof API_ROUTES].length > 0) {
      results[category] = await migrateBatch(category as keyof typeof API_ROUTES);
    }
  }

  // 汇总报告
  console.log('='.repeat(60));
  console.log('📋 迁移完成报告');
  console.log('='.repeat(60));

  let totalSuccess = 0;
  let totalFailed = 0;
  let totalSkipped = 0;

  for (const [category, result] of Object.entries(results)) {
    totalSuccess += result.success;
    totalFailed += result.failed;
    totalSkipped += result.skipped;

    console.log(
      `${category.padEnd(10)}: ✅ ${result.success} | ⏭️ ${result.skipped} | ❌ ${result.failed}`
    );
  }

  console.log('='.repeat(60));
  console.log(`总计: ${totalSuccess + totalFailed + totalSkipped} 个文件`);
  console.log(`✅ 成功: ${totalSuccess}`);
  console.log(`⏭️  跳过: ${totalSkipped}`);
  console.log(`❌ 失败: ${totalFailed}`);
  console.log('='.repeat(60));

  // 运行类型检查
  console.log('\n🔍 运行类型检查...');
  try {
    await execAsync('npx tsc --noEmit');
    console.log('✅ 类型检查通过');
  } catch (error) {
    console.error('❌ 类型检查失败，请手动修复');
  }
}

// 执行迁移
migrateAll().catch(console.error);
