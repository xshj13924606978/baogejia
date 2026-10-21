import { NextResponse } from 'next/server';
import { getAllMemberLevels } from '@/lib/member-level-service';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * /api/help/permissions
 *
 * 系统权限体系帮助文档数据源（公开只读，无需登录）。
 * 对话窗: [#202608311300-权限体系帮助文档生成]
 *
 * 数据来源（全部动态读取数据库，前端组件仅负责展示结构）：
 *  - 等级定义 + 字段权限 + 模块权限：
 *      member_levels / member_field_permissions / member_module_permissions
 *      统一由 member-level-service.getAllMemberLevels() 读取
 *      （模块权限会按 MODULE_DEFAULT_PERMISSIONS 默认矩阵补齐缺失模块）
 *  - 角色标签：roles 表（迁移 075_unified_admin_roles）
 *
 * 响应：
 *   GET -> { success: true, data: { levels: MemberLevelFull[], roles: RoleTag[] } }
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [levels, rolesRes] = await Promise.all([
      getAllMemberLevels(),
      getSupabaseClient()
        .from('roles')
        .select(
          'code, name_zh, name_en, is_super_admin, is_admin, description, level_priority'
        )
        .order('level_priority', { ascending: false })
        .limit(100),
    ]);

    const roles = (rolesRes.data || []).map((r: any) => ({
      code: r.code,
      name_zh: r.name_zh,
      name_en: r.name_en,
      is_super_admin: !!r.is_super_admin,
      is_admin: !!r.is_admin,
      description: r.description ?? null,
      level_priority: r.level_priority ?? 0,
    }));

    return NextResponse.json({ success: true, data: { levels, roles } });
  } catch (error) {
    console.error('[help/permissions GET] 失败:', error);
    return NextResponse.json(
      { success: false, error: '获取权限体系数据失败' },
      { status: 500 }
    );
  }
}
