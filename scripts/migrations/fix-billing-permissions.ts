/**
 * 修复缺失的计费配置权限
 *
 * 问题描述：
 * - admin.billing.view 和 admin.billing.edit 权限未在数据库中定义
 * - 导致 /api/admin/billing/config 接口返回 403 Forbidden
 *
 * 执行方式：npx ts-node scripts/migrations/fix-billing-permissions.ts
 */

import { createClient } from '@supabase/supabase-js';

// 从环境变量获取 Supabase 配置
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 缺少 Supabase 配置环境变量');
  console.error('请确保设置了 NEXT_PUBLIC_SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function fixBillingPermissions() {
  console.log('🔧 开始修复计费配置权限...\n');

  try {
    // 1. 检查权限是否已存在
    console.log('📋 检查现有权限...');
    const { data: existingPerms, error: checkError } = await supabase
      .from('permissions')
      .select('*')
      .in('code', ['admin.billing.view', 'admin.billing.edit']);

    if (checkError) {
      console.error('❌ 检查权限失败:', checkError);
      return;
    }

    console.log(`   现有权限数量: ${existingPerms?.length || 0}`);
    if (existingPerms && existingPerms.length > 0) {
      console.log('   已存在的权限:', existingPerms.map(p => p.code).join(', '));
    }

    // 2. 添加缺失的权限定义
    console.log('\n📝 添加缺失的权限定义...');

    const permissionsToAdd = [
      {
        code: 'admin.billing.view',
        name: '查看计费配置',
        category: 'admin',
        description: '查看计费配置信息',
        resource_type: 'module',
        is_active: true,
      },
      {
        code: 'admin.billing.edit',
        name: '编辑计费配置',
        category: 'admin',
        description: '编辑计费配置',
        resource_type: 'module',
        is_active: true,
      },
    ];

    for (const perm of permissionsToAdd) {
      const { error: insertError } = await supabase
        .from('permissions')
        .upsert(perm, { onConflict: 'code' });

      if (insertError) {
        console.error(`   ❌ 添加权限 ${perm.code} 失败:`, insertError);
      } else {
        console.log(`   ✅ 权限 ${perm.code} 已添加/更新`);
      }
    }

    // 3. 获取新添加的权限 ID
    const { data: newPerms, error: getPermError } = await supabase
      .from('permissions')
      .select('id, code')
      .in('code', ['admin.billing.view', 'admin.billing.edit']);

    if (getPermError || !newPerms) {
      console.error('❌ 获取权限 ID 失败:', getPermError);
      return;
    }

    console.log('\n📋 权限 ID:');
    newPerms.forEach(p => console.log(`   ${p.code}: ${p.id}`));

    // 4. 为超级管理员授予权限
    console.log('\n👑 为超级管理员授予权限...');
    for (const perm of newPerms) {
      const { error: rpError } = await supabase
        .from('role_permissions')
        .upsert(
          {
            role: 'super_admin',
            permission_id: perm.id,
            granted: true,
          },
          { onConflict: 'role,permission_id' }
        );

      if (rpError) {
        console.error(`   ❌ 授予 super_admin ${perm.code} 失败:`, rpError);
      } else {
        console.log(`   ✅ super_admin 已获得 ${perm.code} 权限`);
      }
    }

    // 5. 为管理员角色授予查看权限
    console.log('\n👤 为管理员角色授予查看权限...');
    const viewPerm = newPerms.find(p => p.code === 'admin.billing.view');
    if (viewPerm) {
      const { error: rpError } = await supabase
        .from('role_permissions')
        .upsert(
          {
            role: 'admin',
            permission_id: viewPerm.id,
            granted: true,
          },
          { onConflict: 'role,permission_id' }
        );

      if (rpError) {
        console.error(`   ❌ 授予 admin admin.billing.view 失败:`, rpError);
      } else {
        console.log(`   ✅ admin 已获得 admin.billing.view 权限`);
      }
    }

    // 6. 验证修复结果
    console.log('\n🔍 验证修复结果...');
    const { data: finalPerms, error: finalError } = await supabase
      .from('permissions')
      .select(
        `
        code,
        name,
        role_permissions (
          role,
          granted
        )
      `
      )
      .in('code', ['admin.billing.view', 'admin.billing.edit']);

    if (finalError) {
      console.error('❌ 验证失败:', finalError);
    } else {
      console.log('\n✅ 权限配置完成！\n');
      console.log('权限详情:');
      finalPerms?.forEach(p => {
        console.log(`\n  ${p.code} (${p.name}):`);
        (p as any).role_permissions?.forEach((rp: any) => {
          console.log(`    - ${rp.role}: ${rp.granted ? '✅ 已授权' : '❌ 未授权'}`);
        });
      });
    }

    console.log('\n🎉 修复完成！请刷新页面重试。');
  } catch (error) {
    console.error('❌ 修复过程中发生错误:', error);
  }
}

// 执行修复
fixBillingPermissions();
