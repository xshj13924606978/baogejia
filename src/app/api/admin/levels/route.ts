import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 管理员角色列表
const ADMIN_ROLES = ['admin', 'super_admin', '管理员', '超级管理员', '系统管理员'];

// 默认等级配置（当数据库表不存在时使用）
// 等级配置：1-免费用户, 2-普通会员, 3-VIP会员, 4-企业会员, 5-超级会员
const DEFAULT_LEVELS = [
  {
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
    quotas: {
      daily_quota: 5,
      max_files: 3,
      max_chat_messages: 50,
    },
  },
  {
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
    quotas: {
      daily_quota: 20,
      max_files: 10,
      max_chat_messages: 200,
    },
  },
  {
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
    quotas: {
      daily_quota: 50,
      max_files: 30,
      max_chat_messages: 500,
    },
  },
  {
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
    quotas: {
      daily_quota: 100,
      max_files: 100,
      max_chat_messages: 1000,
    },
  },
  {
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
    quotas: {
      daily_quota: 0, // 0 表示不限制
      max_files: 0,
      max_chat_messages: 0,
    },
  },
];

/**
 * 获取所有等级配置
 * 
 * 功能：获取所有等级（1-5级）的完整配置信息
 * 权限：仅管理员
 */
export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseClient();
    let role: string | null = null;
    
    // 方法1：尝试从 profiles 表获取角色
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('metadata')
      .eq('id', currentUser.id)
      .single();
    
    if (!profileError && profile?.metadata?.role) {
      role = profile.metadata.role;
    }
    
    // 方法2：如果 profiles 没有，尝试从 users 表获取
    if (!role) {
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('metadata')
        .eq('id', currentUser.id)
        .single();
      
      if (!userError && user?.metadata?.role) {
        role = user.metadata.role;
      }
    }
    
    // 方法3：开发环境默认给予管理员权限
    if (!role && process.env.NODE_ENV === 'development') {
      role = '超级管理员';
    }

    // 检查管理员权限
    if (!role || !ADMIN_ROLES.includes(role)) {
      return NextResponse.json(
        { error: '无权限，需要管理员权限' },
        { status: 403 }
      );
    }


    // 获取所有等级配置（1-5级）
    const levels = [];
    for (let i = 1; i <= 5; i++) {
      try {
        const config = await userLevelService.getLevelFullConfig(i);
        if (config) {
          levels.push(config);
        }
      } catch (err) {
      }
    }

    // 如果数据库没有配置，使用默认配置
    if (levels.length === 0) {
      return NextResponse.json({
        success: true,
        levels: DEFAULT_LEVELS,
      });
    }

    return NextResponse.json({
      success: true,
      levels
    });
  } catch (error) {
    console.error('[AdminLevels API] 获取等级配置失败:', error);
    // 出错时也返回默认配置
    return NextResponse.json({
      success: true,
      levels: DEFAULT_LEVELS,
    });
  }
}
