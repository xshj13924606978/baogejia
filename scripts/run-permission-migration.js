/**
 * 执行积分权限修复迁移
 * 使用 Supabase JS SDK 执行 SQL 迁移
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// 从环境变量获取配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.COZE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('错误: 缺少必要的环境变量');
  console.error('需要: NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// 创建 Supabase 客户端（使用 service role key）
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function executeMigration() {
  console.log('开始执行积分权限修复迁移...\n');

  try {
    // 1. 添加缺失的权限定义
    console.log('1. 添加权限定义...');
    const permissions = [
      ['admin.billing.view', '查看计费配置', 'admin', '查看计费配置信息', 'module'],
      ['admin.billing.edit', '编辑计费配置', 'admin', '编辑计费配置', 'module'],
      ['admin.points.view', '查看积分流水', 'admin', '查看所有用户的积分流水记录', 'module'],
      ['admin.points.manage', '管理积分', 'admin', '管理用户积分，包括手动调整', 'module']
    ];

    for (const [code, name, category, description, resourceType] of permissions) {
      // 先检查权限是否存在
      const { data: existingPerm, error: checkError } = await supabase
        .from('permissions')
        .select('id')
        .eq('code', code)
        .single();

      if (existingPerm) {
        // 更新现有权限
        const { error: updateError } = await supabase
          .from('permissions')
          .update({ name, category, description, resource_type: resourceType })
          .eq('code', code);

        if (updateError) {
          console.log(`  - 更新权限 ${code}: 失败 - ${updateError.message}`);
        } else {
          console.log(`  - 更新权限 ${code}: 成功`);
        }
      } else {
        // 插入新权限
        const { error: insertError } = await supabase
          .from('permissions')
          .insert({ code, name, category, description, resource_type: resourceType });

        if (insertError) {
          console.log(`  - 添加权限 ${code}: 失败 - ${insertError.message}`);
        } else {
          console.log(`  - 添加权限 ${code}: 成功`);
        }
      }
    }

    // 2. 获取权限 ID
    console.log('\n2. 获取权限 ID...');
    const { data: permData, error: permError } = await supabase
      .from('permissions')
      .select('id, code')
      .in('code', ['admin.billing.view', 'admin.billing.edit', 'admin.points.view', 'admin.points.manage']);

    if (permError || !permData) {
      console.error('获取权限 ID 失败:', permError);
      return;
    }

    const permMap = {};
    permData.forEach(p => { permMap[p.code] = p.id; });
    console.log('权限 ID:', permMap);

    // 3. 为超级管理员授予权限
    console.log('\n3. 为 super_admin 角色授予权限...');
    for (const [code, id] of Object.entries(permMap)) {
      // 检查是否已存在
      const { data: existing } = await supabase
        .from('role_permissions')
        .select('id')
        .eq('role', 'super_admin')
        .eq('permission_id', id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('role_permissions')
          .update({ granted: true })
          .eq('role', 'super_admin')
          .eq('permission_id', id);
        console.log(`  - super_admin -> ${code}: ${error ? '失败' : '更新成功'}`);
      } else {
        const { error } = await supabase
          .from('role_permissions')
          .insert({ role: 'super_admin', permission_id: id, granted: true });
        console.log(`  - super_admin -> ${code}: ${error ? '失败' : '授权成功'}`);
      }
    }

    // 4. 为管理员角色授予查看权限
    console.log('\n4. 为 admin 角色授予查看权限...');
    const viewPerms = ['admin.billing.view', 'admin.points.view'];
    for (const code of viewPerms) {
      const id = permMap[code];
      if (!id) continue;

      const { data: existing } = await supabase
        .from('role_permissions')
        .select('id')
        .eq('role', 'admin')
        .eq('permission_id', id)
        .single();

      if (existing) {
        const { error } = await supabase
          .from('role_permissions')
          .update({ granted: true })
          .eq('role', 'admin')
          .eq('permission_id', id);
        console.log(`  - admin -> ${code}: ${error ? '失败' : '更新成功'}`);
      } else {
        const { error } = await supabase
          .from('role_permissions')
          .insert({ role: 'admin', permission_id: id, granted: true });
        console.log(`  - admin -> ${code}: ${error ? '失败' : '授权成功'}`);
      }
    }

    // 5. 验证结果
    console.log('\n5. 验证权限配置...');
    const { data: verifyData, error: verifyError } = await supabase
      .from('permissions')
      .select('code, name, role_permissions(role, granted)')
      .in('code', ['admin.billing.view', 'admin.billing.edit', 'admin.points.view', 'admin.points.manage']);

    if (verifyData) {
      console.log('\n权限配置结果:');
      verifyData.forEach(perm => {
        console.log(`  ${perm.code} (${perm.name}):`);
        if (perm.role_permissions && perm.role_permissions.length > 0) {
          perm.role_permissions.forEach(rp => {
            console.log(`    - ${rp.role}: ${rp.granted ? '已授权' : '未授权'}`);
          });
        } else {
          console.log('    - 无角色授权');
        }
      });
    }

    console.log('\n迁移完成！');
  } catch (error) {
    console.error('迁移执行失败:', error);
  }
}

// 执行迁移
executeMigration();
