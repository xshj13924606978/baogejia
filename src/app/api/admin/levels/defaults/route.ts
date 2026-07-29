import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';

// 管理员角色列表
const ADMIN_ROLES = ['admin', 'super_admin', '管理员', '超级管理员', '系统管理员'];

// 默认等级配置
// 等级配置：1-免费用户, 2-普通会员, 3-VIP会员, 4-企业会员, 5-超级会员
const DEFAULT_LEVELS = [
  { level: 1, name: '免费用户', required_points: 0, role: 'free_user', daily_quota: 5, max_files: 3, max_chat_messages: 50, permissions: ['chat', 'quote'], can_view_cost_price: false, can_view_min_price: false, can_view_manufacturer: false, can_view_contact: false, can_view_phone: false },
  { level: 2, name: '普通会员', required_points: 100, role: 'normal_member', daily_quota: 20, max_files: 10, max_chat_messages: 200, permissions: ['chat', 'quote', 'history'], can_view_cost_price: false, can_view_min_price: true, can_view_manufacturer: false, can_view_contact: false, can_view_phone: false },
  { level: 3, name: 'VIP会员', required_points: 500, role: 'vip_member', daily_quota: 50, max_files: 30, max_chat_messages: 500, permissions: ['chat', 'quote', 'history', 'export'], can_view_cost_price: false, can_view_min_price: true, can_view_manufacturer: true, can_view_contact: true, can_view_phone: false },
  { level: 4, name: '企业会员', required_points: 2000, role: 'enterprise_member', daily_quota: 100, max_files: 100, max_chat_messages: 1000, permissions: ['chat', 'quote', 'history', 'export', 'analytics'], can_view_cost_price: true, can_view_min_price: true, can_view_manufacturer: true, can_view_contact: true, can_view_phone: true },
  { level: 5, name: '超级会员', required_points: 10000, role: 'super_member', daily_quota: 0, max_files: 0, max_chat_messages: 0, permissions: ['chat', 'quote', 'history', 'export', 'analytics', 'api'], can_view_cost_price: true, can_view_min_price: true, can_view_manufacturer: true, can_view_contact: true, can_view_phone: true },
];

// 获取用户角色的辅助函数
async function getUserRole(supabase: any, userId: any): Promise<string | null> {
  const { data: userRole } = await supabase.from('user_roles').select('role').eq('user_id', userId).single();
  if (userRole?.role) return userRole.role;
  const { data: profile } = await supabase.from('profiles').select('metadata').eq('id', userId).single();
  if (profile?.metadata?.role) return profile.metadata.role;
  const { data: user } = await supabase.from('users').select('metadata').eq('id', userId).single();
  if (user?.metadata?.role) return user.metadata.role;
  if (process.env.NODE_ENV === 'development') return '超级管理员';
  return null;
}

/**
 * 获取系统默认等级配置API
 */
export async function GET(request: NextRequest) {
  try {
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseClient();
    const role = await getUserRole(supabase, currentUser.id);

    if (!role || !ADMIN_ROLES.includes(role)) {
      return NextResponse.json({ error: '权限不足' }, { status: 403 });
    }


    const { data: defaultConfigs, error } = await supabase.from('level_definitions').select('*').order('level');

    if (error || !defaultConfigs || defaultConfigs.length === 0) {
      return NextResponse.json(DEFAULT_LEVELS);
    }

    return NextResponse.json(defaultConfigs);
  } catch (error) {
    console.error('[Defaults API] 获取默认配置失败:', error);
    return NextResponse.json(DEFAULT_LEVELS);
  }
}
