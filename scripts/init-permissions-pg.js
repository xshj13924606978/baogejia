/**
 * 权限系统初始化脚本
 * 使用 PostgreSQL 客户端直接执行 SQL
 */

const { Pool } = require('pg');

// 从环境变量获取数据库连接信息
const connectionString = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;

if (!connectionString) {
  console.error('缺少数据库连接字符串');
  console.error('请设置 DATABASE_URL 环境变量');
  process.exit(1);
}

// 创建 PostgreSQL 连接池
const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

/**
 * 执行 SQL 语句
 */
async function executeSQL(sql, description = '') {
  try {
    await pool.query(sql);
    console.log(`✅ ${description || 'SQL 执行成功'}`);
    return true;
  } catch (error) {
    if (error.code === '42P01') {
      console.log(`⚠️  ${description || 'SQL 执行失败'}: 表不存在`);
    } else {
      console.log(`❌ ${description || 'SQL 执行失败'}: ${error.message}`);
    }
    return false;
  }
}

/**
 * 主函数
 */
async function init() {
  const client = await pool.connect();
  
  try {
    console.log('========================================');
    console.log('权限系统初始化');
    console.log('========================================\n');

    // 1. 创建 permissions 表
    console.log('创建 permissions 表...');
    await executeSQL(`
      CREATE TABLE IF NOT EXISTS permissions (
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
      )
    `, '创建 permissions 表');

    // 2. 创建 role_permissions 表
    console.log('创建 role_permissions 表...');
    await executeSQL(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id SERIAL PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
        granted BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(role, permission_id)
      )
    `, '创建 role_permissions 表');

    // 3. 创建 user_permissions 表
    console.log('创建 user_permissions 表...');
    await executeSQL(`
      CREATE TABLE IF NOT EXISTS user_permissions (
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
      )
    `, '创建 user_permissions 表');

    // 4. 创建索引
    console.log('创建索引...');
    await executeSQL(`CREATE INDEX IF NOT EXISTS idx_permissions_code ON permissions(code)`, 'idx_permissions_code');
    await executeSQL(`CREATE INDEX IF NOT EXISTS idx_permissions_category ON permissions(category)`, 'idx_permissions_category');
    await executeSQL(`CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role)`, 'idx_role_permissions_role');
    await executeSQL(`CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id)`, 'idx_role_permissions_permission_id');

    // 5. 插入基础权限数据
    console.log('插入权限数据...');
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

    let insertedCount = 0;
    for (const perm of permissions) {
      try {
        const insertSQL = `
          INSERT INTO permissions (code, name, category, description, resource_type)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (code) DO NOTHING
        `;
        await client.query(insertSQL, [perm.code, perm.name, perm.category, perm.description, perm.resource_type]);
        insertedCount++;
      } catch (error) {
        console.log(`⚠️  权限 ${perm.code} 插入失败（可能已存在）`);
      }
    }
    console.log(`✅ 插入 ${insertedCount} 条权限数据`);

    console.log('\n========================================');
    console.log('✅ 权限系统初始化完成');
    console.log('========================================');
  } finally {
    client.release();
    await pool.end();
  }
}

// 执行初始化
init().catch(error => {
  console.error('初始化失败:', error);
  process.exit(1);
});
