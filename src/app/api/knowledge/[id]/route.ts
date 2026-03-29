/**
 * 知识库单条详情 API
 *
 * GET /api/knowledge/[id]
 *
 * 权限：
 * - 未登录：只能看 approved
 * - 普通用户：只能看 approved 或自己上传的
 * - 超管/管理员：可看全部
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';

const ROLE_MAP: Record<string, string> = {
  '超级管理员': 'super_admin', '系统管理员': 'admin', '管理员': 'admin',
  'VIP会员': 'vip', 'VIP用户': 'vip', '付费会员': 'premium', '普通会员': 'premium',
  '免费用户': 'free', '企业用户': 'enterprise', '待审核': 'pending', 'user': 'user',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getSupabaseServiceClient();

    const { data: entry, error } = await db
      .from('knowledge_entries')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !entry) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    // 获取当前用户（可能为 null）
    let currentUser = null;
    try {
      currentUser = await getCurrentUser(request);
    } catch { /* ignore */ }

    const currentUserId = currentUser?.id || null;
    const normalizedRole = currentUser?.role
      ? (ROLE_MAP[currentUser.role] || currentUser.role)
      : null;

    // 权限判断
    if (entry.status !== 'approved') {
      // 非approved条目：仅超管/管理员/上传者本人可见
      const isSelf = currentUserId === entry.user_id;
      const isAdmin = normalizedRole === 'super_admin' || normalizedRole === 'admin';
      if (!isSelf && !isAdmin) {
        return NextResponse.json({ success: false, error: '无权限查看' }, { status: 403 });
      }
    }

    // 获取上传者信息
    let uploaderName = '未知';
    if (entry.user_id) {
      try {
        const { data: user } = await db
          .from('users')
          .select('id, username, full_name')
          .eq('id', entry.user_id)
          .single();
        if (user) uploaderName = user.full_name || user.username || user.id;
      } catch { /* ignore */ }
    }

    // 获取 tags
    let tags: string[] = [];
    try {
      const { data: tagRelations } = await db
        .from('knowledge_entry_tags')
        .select('tag_id, knowledge_tags(name)')
        .eq('entry_id', id);
      if (tagRelations) {
        tags = tagRelations.map((r: any) => r.knowledge_tags?.name).filter(Boolean);
      }
    } catch { /* ignore */ }

    // 下载权限
    let canDownload = true;
    if (!currentUserId) {
      canDownload = false;
    } else if (normalizedRole === 'free' || normalizedRole === 'pending') {
      canDownload = false;
    }

    return NextResponse.json({
      success: true,
      data: {
        ...entry,
        uploader_name: uploaderName,
        tags,
      },
      permissions: { can_download: canDownload },
    });
  } catch (error: any) {
    console.error('[Knowledge Detail] 异常:', error);
    return NextResponse.json({ success: false, error: '获取详情失败' }, { status: 500 });
  }
}
