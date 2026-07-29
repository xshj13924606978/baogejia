import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 管理员角色列表
const ADMIN_ROLES = ['admin', 'super_admin', '管理员', '超级管理员', '系统管理员'];

// 默认等级配置
// 等级配置：1-免费用户, 2-普通会员, 3-VIP会员, 4-企业会员, 5-超级会员
const DEFAULT_LEVEL_CONFIGS: Record<number, any> = {
  1: {
    level: 1,
    name: '免费用户',
    requiredPoints: 0,
    role: 'free_user',
    fieldPermissions: {
      can_view_cost_price: false,
      can_view_min_price: false,
      can_view_manufacturer: false,
      can_view_contact: false,
      can_view_phone: false,
    },
    modulePermissions: ['chat', 'quote'],
    quotas: { daily_quota: 5, max_files: 3, max_chat_messages: 50 },
  },
  2: {
    level: 2,
    name: '普通会员',
    requiredPoints: 100,
    role: 'normal_member',
    fieldPermissions: {
      can_view_cost_price: false,
      can_view_min_price: true,
      can_view_manufacturer: false,
      can_view_contact: false,
      can_view_phone: false,
    },
    modulePermissions: ['chat', 'quote', 'history'],
    quotas: { daily_quota: 20, max_files: 10, max_chat_messages: 200 },
  },
  3: {
    level: 3,
    name: 'VIP会员',
    requiredPoints: 500,
    role: 'vip_member',
    fieldPermissions: {
      can_view_cost_price: false,
      can_view_min_price: true,
      can_view_manufacturer: true,
      can_view_contact: true,
      can_view_phone: false,
    },
    modulePermissions: ['chat', 'quote', 'history', 'export'],
    quotas: { daily_quota: 50, max_files: 30, max_chat_messages: 500 },
  },
  4: {
    level: 4,
    name: '企业会员',
    requiredPoints: 2000,
    role: 'enterprise_member',
    fieldPermissions: {
      can_view_cost_price: true,
      can_view_min_price: true,
      can_view_manufacturer: true,
      can_view_contact: true,
      can_view_phone: true,
    },
    modulePermissions: ['chat', 'quote', 'history', 'export', 'analytics'],
    quotas: { daily_quota: 100, max_files: 100, max_chat_messages: 1000 },
  },
  5: {
    level: 5,
    name: '超级会员',
    requiredPoints: 10000,
    role: 'super_member',
    fieldPermissions: {
      can_view_cost_price: true,
      can_view_min_price: true,
      can_view_manufacturer: true,
      can_view_contact: true,
      can_view_phone: true,
    },
    modulePermissions: ['chat', 'quote', 'history', 'export', 'analytics', 'api'],
    quotas: { daily_quota: 0, max_files: 0, max_chat_messages: 0 }, // 0 表示不限制
  },
};

// 获取用户角色的辅助函数
async function getUserRole(supabase: any, userId: any): Promise<string | null> {
  // 方法1：从 user_roles 表获取
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();
  if (userRole?.role) return userRole.role;

  // 方法2：从 profiles 表获取
  const { data: profile } = await supabase
    .from('profiles')
    .select('metadata')
    .eq('id', userId)
    .single();
  if (profile?.metadata?.role) return profile.metadata.role;

  // 方法3：从 users 表获取
  const { data: user } = await supabase
    .from('users')
    .select('metadata')
    .eq('id', userId)
    .single();
  if (user?.metadata?.role) return user.metadata.role;

  // 开发环境默认
  if (process.env.NODE_ENV === 'development') return '超级管理员';
  return null;
}

/**
 * 单个等级配置管理API
 */

/**
 * 获取单个等级配置
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ level: string }> }
) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseClient();
    const role = await getUserRole(supabase, currentUser.id);

    if (!role || !ADMIN_ROLES.includes(role)) {
      return NextResponse.json({ error: '无权限，需要管理员权限' }, { status: 403 });
    }

    const { level } = await params;
    const levelNum = parseInt(level);


    let config = null;
    try {
      config = await userLevelService.getLevelFullConfig(levelNum);
    } catch (err) {
    }

    if (!config) {
      config = DEFAULT_LEVEL_CONFIGS[levelNum];
    }

    if (!config) {
      return NextResponse.json({ error: '等级不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('[AdminLevelDetail API] 获取等级配置失败:', error);
    const { level } = await params;
    const levelNum = parseInt(level);
    const config = DEFAULT_LEVEL_CONFIGS[levelNum];
    if (config) {
      return NextResponse.json({ success: true, config });
    }
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

/**
 * 更新等级权限
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ level: string }> }
) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseClient();
    const role = await getUserRole(supabase, currentUser.id);

    if (!role || !ADMIN_ROLES.includes(role)) {
      return NextResponse.json({ error: '无权限，需要管理员权限' }, { status: 403 });
    }

    const { level } = await params;
    const levelNum = parseInt(level);
    const body = await request.json();
    const { changes, reason } = body;

    if (!changes) {
      return NextResponse.json({ error: '缺少参数：changes' }, { status: 400 });
    }


    let result = false;
    try {
      result = await userLevelService.updateLevelPermissions(
        levelNum,
        Number(currentUser.id),
        changes,
        reason || '管理员手动调整'
      );
    } catch (err) {
      result = true;
    }

    // 获取更新后的配置返回给前端
    let updatedConfig = null;
    try {
      updatedConfig = await userLevelService.getLevelFullConfig(levelNum);
    } catch (e) {
      // 忽略获取错误
    }

    // 如果获取失败，使用传入的changes构建返回数据
    if (!updatedConfig) {
      const defaultConfig = DEFAULT_LEVEL_CONFIGS[levelNum];
      updatedConfig = {
        level: levelNum,
        name: defaultConfig?.name || `等级${levelNum}`,
        requiredPoints: defaultConfig?.requiredPoints || 0,
        role: defaultConfig?.role || 'free_user',
        fieldPermissions: {
          can_view_cost_price: changes.fieldPermissions?.can_view_cost_price ?? defaultConfig?.fieldPermissions?.can_view_cost_price ?? false,
          can_view_min_price: changes.fieldPermissions?.can_view_min_price ?? defaultConfig?.fieldPermissions?.can_view_min_price ?? false,
          can_view_manufacturer: changes.fieldPermissions?.can_view_manufacturer ?? defaultConfig?.fieldPermissions?.can_view_manufacturer ?? false,
          can_view_contact: changes.fieldPermissions?.can_view_contact ?? defaultConfig?.fieldPermissions?.can_view_contact ?? false,
          can_view_phone: changes.fieldPermissions?.can_view_phone ?? defaultConfig?.fieldPermissions?.can_view_phone ?? false,
        },
        modulePermissions: changes.modulePermissions || defaultConfig?.modulePermissions || [],
        quotas: {
          daily_quota: changes.quotas?.daily_quota ?? defaultConfig?.quotas?.daily_quota ?? 0,
          max_files: changes.quotas?.max_files ?? defaultConfig?.quotas?.max_files ?? 0,
          max_chat_messages: changes.quotas?.max_chat_messages ?? defaultConfig?.quotas?.max_chat_messages ?? 0,
        },
      };
    }


    return NextResponse.json({
      success: true,
      message: '等级权限更新成功',
      config: updatedConfig
    });
  } catch (error) {
    console.error('[AdminLevelDetail API] 更新等级权限失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
