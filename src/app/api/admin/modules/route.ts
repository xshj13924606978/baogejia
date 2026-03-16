import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 管理员角色列表
const ADMIN_ROLES = ['admin', 'super_admin', '管理员', '超级管理员', '系统管理员'];

// 默认模块列表（当数据库表不存在时使用）
const DEFAULT_MODULES = [
  { id: 1, module_code: 'chat', module_name: '智能对话', description: 'AI智能对话与问答功能', is_active: true },
  { id: 2, module_code: 'quote', module_name: '报价生成', description: '产品报价单智能生成', is_active: true },
  { id: 3, module_code: 'history', module_name: '历史记录', description: '查看历史对话和报价记录', is_active: true },
  { id: 4, module_code: 'export', module_name: '导出功能', description: '导出PDF和Excel文件', is_active: true },
  { id: 5, module_code: 'analytics', module_name: '数据分析', description: '统计分析与数据报告', is_active: true },
  { id: 6, module_code: 'api', module_name: 'API接口', description: 'API接口调用权限', is_active: true },
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
 * 模块管理 API（管理员）
 *
 * 功能：
 * - GET: 获取所有模块列表
 */

/**
 * 获取模块列表
 */
export async function GET(request: NextRequest) {
  try {
    console.log('[Modules API] 获取模块列表');

    // 检查用户登录
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json({ error: '未登录或用户信息无效' }, { status: 401 });
    }

    const supabase = getSupabaseClient();
    const role = await getUserRole(supabase, currentUser.id);

    if (!role || !ADMIN_ROLES.includes(role)) {
      return NextResponse.json({ error: '无权限，需要管理员权限' }, { status: 403 });
    }
    
    // 查询模块列表
    const { data: modules, error } = await supabase
      .from('modules')
      .select('*')
      .order('module_code');

    if (error) {
      console.log('[Modules API] 查询模块列表失败，使用默认值:', error.message);
      return NextResponse.json({
        success: true,
        modules: DEFAULT_MODULES
      });
    }

    return NextResponse.json({
      success: true,
      modules: modules || DEFAULT_MODULES
    });
  } catch (error) {
    console.error('[Modules API] 获取模块列表异常:', error);
    // 出错时也返回默认值
    return NextResponse.json({
      success: true,
      modules: DEFAULT_MODULES
    });
  }
}
