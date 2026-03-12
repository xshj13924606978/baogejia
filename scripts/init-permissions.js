/**
 * 权限系统初始化脚本
 * 逐步创建表和插入数据
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });
const { createClient } = require('@supabase/supabase-js');

// 创建 Supabase 客户端
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

/**
 * 创建表
 */
async function createTable(tableName, schema) {
  console.log(`创建表: ${tableName}`);
  
  try {
    // 使用 Supabase 的 SQL 执行
    const { data, error } = await supabase.rpc('exec_sql', { 
      sql_query: `CREATE TABLE IF NOT EXISTS ${tableName} (${schema})`
    });
    
    if (error) throw error;
    console.log(`✅ 表 ${tableName} 创建成功`);
    return true;
  } catch (error) {
    console.log(`❌ 表 ${tableName} 创建失败: ${error.message}`);
    // 尝试直接执行
    try {
      const { error: err2 } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);
      if (!err2) {
        console.log(`✅ 表 ${tableName} 已存在`);
        return true;
      }
    } catch (e) {
      // 忽略
    }
    return false;
  }
}

/**
 * 创建索引
 */
async function createIndex(indexName, tableName, column, options = '') {
  console.log(`创建索引: ${indexName}`);
  
  try {
    const { error } = await supabase.rpc('exec_sql', { 
      sql_query: `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName}(${column}) ${options}`
    });
    
    if (error) throw error;
    console.log(`✅ 索引 ${indexName} 创建成功`);
    return true;
  } catch (error) {
    console.log(`⚠️  索引 ${indexName} 创建失败（可能已存在）`);
    return true;
  }
}

/**
 * 插入权限数据
 */
async function insertPermissions() {
  const permissions = [
    // 用户相关
    { code: 'user.view', name: '查看用户', category: 'user', description: '查看用户列表和详情', resource_type: 'module' },
    { code: 'user.create', name: '创建用户', category: 'user', description: '创建新用户', resource_type: 'module' },
    { code: 'user.edit', name: '编辑用户', category: 'user', description: '编辑用户信息', resource_type: 'module' },
    { code: 'user.delete', name: '删除用户', category: 'user', description: '删除用户', resource_type: 'module' },
    { code: 'user.manage', name: '管理用户', category: 'user', description: '管理用户权限和角色', resource_type: 'module' },
    
    // 产品相关
    { code: 'product.search', name: '搜索产品', category: 'product', description: '搜索产品信息', resource_type: 'module' },
    { code: 'product.view', name: '查看产品', category: 'product', description: '查看产品详情', resource_type: 'module' },
    { code: 'product.edit', name: '编辑产品', category: 'product', description: '编辑产品信息', resource_type: 'module' },
    { code: 'product.export', name: '导出产品', category: 'product', description: '导出产品数据', resource_type: 'module' },
    
    // 成本相关
    { code: 'cost_price.view', name: '查看成本价', category: 'product', description: '查看产品成本价', resource_type: 'field' },
    { code: 'min_price.view', name: '查看最低售价', category: 'product', description: '查看产品最低售价', resource_type: 'field' },
    { code: 'manufacturer.view', name: '查看厂家信息', category: 'product', description: '查看厂家信息', resource_type: 'field' },
    
    // 报价相关
    { code: 'quote.create', name: '创建报价', category: 'quote', description: '创建新的报价单', resource_type: 'module' },
    { code: 'quote.view', name: '查看报价', category: 'quote', description: '查看报价详情', resource_type: 'module' },
    { code: 'quote.edit', name: '编辑报价', category: 'quote', description: '编辑报价信息', resource_type: 'module' },
    { code: 'quote.export', name: '导出报价', category: 'quote', description: '导出报价数据', resource_type: 'module' },
    
    // 等级管理
    { code: 'admin.levels.view', name: '查看等级配置', category: 'admin', description: '查看等级配置信息', resource_type: 'module' },
    { code: 'admin.levels.edit', name: '编辑等级配置', category: 'admin', description: '编辑等级配置', resource_type: 'module' },
    
    // 用户管理
    { code: 'admin.users.view', name: '查看用户列表', category: 'admin', description: '查看用户列表', resource_type: 'module' },
    { code: 'admin.users.edit', name: '编辑用户', category: 'admin', description: '编辑用户信息', resource_type: 'module' },
  ];

  console.log('插入权限数据...');
  
  let successCount = 0;
  for (const perm of permissions) {
    try {
      const { error } = await supabase
        .from('permissions')
        .insert(perm)
        .select();
      
      if (error) {
        if (error.code === '23505') {
          // 唯一约束冲突，跳过
          continue;
        }
        throw error;
      }
      successCount++;
    } catch (error) {
      console.log(`⚠️  权限 ${perm.code} 插入失败（可能已存在）`);
    }
  }
  
  console.log(`✅ 插入 ${successCount} 条权限数据`);
}

/**
 * 主函数
 */
async function init() {
  console.log('========================================');
  console.log('权限系统初始化');
  console.log('========================================\n');

  // 创建 permissions 表
  await createTable('permissions', `
    id SERIAL PRIMARY KEY,
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(50) NOT NULL,
    description TEXT,
    resource_type VARCHAR(50),
    resource_path VARCHAR(200),
    method VARCHAR(10),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  `);

  // 创建 role_permissions 表
  await createTable('role_permissions', `
    id SERIAL PRIMARY KEY,
    role VARCHAR(50) NOT NULL,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    granted BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(role, permission_id)
  `);

  // 创建 user_permissions 表
  await createTable('user_permissions', `
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
    granted BOOLEAN DEFAULT true,
    reason VARCHAR(200),
    expires_at TIMESTAMP,
    created_by INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, permission_id)
  `);

  // 创建索引
  await createIndex('idx_permissions_code', 'permissions', 'code');
  await createIndex('idx_permissions_category', 'permissions', 'category');
  await createIndex('idx_role_permissions_role', 'role_permissions', 'role');

  // 插入权限数据
  await insertPermissions();

  console.log('\n========================================');
  console.log('✅ 权限系统初始化完成');
  console.log('========================================');
}

// 执行初始化
init().catch(error => {
  console.error('初始化失败:', error);
  process.exit(1);
});
