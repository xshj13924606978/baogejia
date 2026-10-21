import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { getUserPermissions } from '@/lib/permission/permission-service';
import { consumeKnowledgeResource } from '@/lib/knowledge/points-download';
import { logUserAction } from '@/lib/user-log-service';

/**
 * 知识库查看详情 API（用于定额库等"查看详情扣积分"场景）
 *
 * POST /api/knowledge/view
 * Body: { entryId: string }
 *
 * 1. 检查用户等级权限（knowledge:view）
 * 2. 按 资源类型+角色 读取扣费配置（points_download_config，如 quota.view=5）
 * 3. 原子扣减积分（自上传不扣分）
 * 4. 非自上传资源按比例分成（70% 上传者 / 30% 平台），写入 points_split_records
 * 5. 返回详情内容
 */

export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveAuthContext(request);
    if (!ctx.isAuthenticated) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const { entryId } = await request.json();
    if (!entryId) {
      return NextResponse.json({ success: false, error: '缺少 entryId' }, { status: 400 });
    }

    const normalizedRole = ctx.effectiveRole;
    const db = getSupabaseServiceClient();

    const { data: entry, error: fetchError } = await db
      .from('knowledge_entries')
      .select('id, title, description, content, metadata, file_url, file_name, status, user_id, type')
      .eq('id', entryId)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    // 非approved：仅超管和上传者本人可查看
    if (entry.status !== 'approved' && entry.user_id !== ctx.currentUserId && normalizedRole !== 'super_admin') {
      return NextResponse.json({ success: false, error: '该条目尚未通过审核' }, { status: 403 });
    }

    // 查看权限检查（自上传跳过）
    if (entry.user_id !== ctx.currentUserId) {
      const perms = await getUserPermissions(ctx.currentUserId || '', normalizedRole);
      const canView = perms.actions['knowledge:view'] ?? false;
      if (!canView) {
        return NextResponse.json({ success: false, error: '当前角色无查看权限' }, { status: 403 });
      }
    }

    // 扣费 + 分成（自上传不扣分；按资源类型+角色读取 points_download_config）
    const consume = await consumeKnowledgeResource({
      db,
      entry: { id: entry.id, type: entry.type, user_id: entry.user_id },
      actionType: 'view',
      currentUserId: ctx.currentUserId,
      effectiveRole: normalizedRole,
    });

    if (!consume.success) {
      return NextResponse.json({
        success: false,
        error: consume.reason || '查看详情失败',
        required_points: consume.cost,
      }, { status: consume.cost > 0 ? 402 : 500 });
    }

    // 记录日志（失败静默）
    await logUserAction({
      userId: ctx.currentUserId!,
      actionType: 'view',
      actionDetails: {
        entry_id: entry.id,
        title: entry.title,
        own_file: entry.user_id === ctx.currentUserId,
        points_deducted: consume.cost,
        creator_share: consume.creatorShare,
        platform_share: consume.platformShare,
      },
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({
      success: true,
      id: entry.id,
      title: entry.title,
      description: entry.description || '',
      content: entry.content || '',
      metadata: entry.metadata || {},
      file_url: entry.file_url,
      file_name: entry.file_name,
      points_deducted: consume.cost,
      creator_share: consume.creatorShare,
      message: consume.cost > 0 ? `消耗 ${consume.cost} 积分` : '',
    });
  } catch (error: any) {
    console.error('[Knowledge View API] 异常:', error);
    return NextResponse.json({ success: false, error: '查看详情失败' }, { status: 500 });
  }
}
