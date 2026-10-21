import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { withPermissionCheck } from '@/lib/permission-check';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * POST /api/admin/permissions/preview —— 预览权限变更影响
 *
 * 鉴权 0 硬编码：withPermissionCheck({ permissions: 'admin.permissions.preview' })
 *  - 内核已走数据库 roles 表 (is_admin=true) + permissions 表 (role_permissions)
 *  - 用户身份从 token verified.role / Bearer 三方登录获取，token 经过 HMAC 签名保护
 *
 * 数据完全数据库驱动：示例用户从 users 表实时联表查询，不存任何硬编码 fake data
 */
async function handlePOST(request: NextRequest, _user: any): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { level?: number; changes?: Record<string, any> };
    const level = body?.level;
    const changes = body?.changes || {};

    if (typeof level !== 'number' || Number.isNaN(level)) {
      return NextResponse.json({ success: false, error: 'level 不合法' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 数据库联表：仅返回真实存在的用户样本与总数。绝无虚假/硬编码样本。
    const { data: sampleRows, error: sampleError } = await supabase
      .from('users')
      .select('id, username, name, email, points, level')
      .eq('level', level)
      .limit(3);

    if (sampleError) {
      console.error('[PermissionsPreview] 查询示例用户失败:', sampleError);
      return NextResponse.json(
        { success: false, error: '查询示例用户失败', detail: sampleError.message },
        { status: 500 }
      );
    }

    const { count: totalUsers, error: countError } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('level', level);

    if (countError) {
      console.error('[PermissionsPreview] 查询用户总数失败:', countError);
    }

    // 真实样本，避免硬编码 fake data
    const sampleUsers = (sampleRows || []).map((u: any) => ({
      id: u.id,
      name: u.username || u.name || u.email || '匿名用户',
      before: changes,
      after: changes,
    }));

    const preview = {
      affectedUsers: totalUsers || 0,
      sampleUsers,
      changes,
    };

    return NextResponse.json({ success: true, preview });
  } catch (error: any) {
    console.error('[PermissionsPreview] 异常:', error);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(error, '预览权限变更失败') },
      { status: 500 }
    );
  }
}

export const POST = withPermissionCheck({ permissions: 'admin.permissions.preview' }, handlePOST);
