import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { getUserPermissions } from '@/lib/permission/permission-service';
import { consumeKnowledgeResource } from '@/lib/knowledge/points-download';
import { logUserAction } from '@/lib/user-log-service';

/**
 * 知识库文件签名 URL 下载 API
 *
 * POST /api/knowledge/download-url
 * Body: { entryId: string }
 *
 * 1. 验证权限：已审批通过 或 上传者本人 或 管理员
 * 2. 检查角色下载权限 + 扣费（与 /api/knowledge/download 一致；自上传不扣分）
 * 3. 查询 storage_path（回退 file_key / file_url 提取）
 * 4. 调用 createSignedUrl() 生成短期签名 URL
 * 5. 返回签名 URL + 原始文件名，前端通过 <a> 标签直接下载
 */

function extractStoragePathFromUrl(fileUrl: string): string {
  if (!fileUrl) return '';
  try {
    const url = new URL(fileUrl);
    const parts = url.pathname.split('/');
    // /storage/v1/object/public/{bucket}/{path}
    if (parts.length >= 6 && parts[1] === 'storage' && parts[2] === 'v1' && parts[3] === 'object') {
      return parts.slice(6).join('/');
    }
    return '';
  } catch {
    return '';
  }
}

function isAdminRole(role: string | null | undefined): boolean {
  if (!role) return false;
  return ['admin', 'super_admin', 'Admin', 'SUPER_ADMIN', '管理员', '超级管理员'].includes(role);
}

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

    const db = getSupabaseServiceClient();

    // 1. 获取条目信息
    const { data: entry, error: fetchError } = await db
      .from('knowledge_entries')
      .select('id, title, file_name, file_key, file_url, file_size, file_type, status, user_id, type, metadata, storage_path, storage_bucket')
      .eq('id', entryId)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    // 2. 权限验证：已审批通过 或 上传者本人 或 管理员
    const isOwner = entry.user_id === ctx.currentUserId;
    const isAdmin = isAdminRole(ctx.effectiveRole);
    if (entry.status !== 'approved' && !isOwner && !isAdmin) {
      return NextResponse.json({ success: false, error: '该条目尚未通过审核' }, { status: 403 });
    }

    // 2.1 检查角色下载权限（自上传文件跳过）
    if (!isOwner) {
      try {
        const perms = await getUserPermissions(ctx.currentUserId || '', ctx.effectiveRole);
        const canDownload = perms.actions['knowledge:download'] ?? false;
        if (!canDownload) {
          return NextResponse.json({ success: false, error: '当前角色无下载权限' }, { status: 403 });
        }
      } catch { /* 权限服务异常时继续，由扣费/存储流程兜底 */ }
    }

    // 2.2 扣费 + 分成（自上传不扣分；按资源类型+角色读取 points_download_config）
    const consume = await consumeKnowledgeResource({
      db,
      entry: { id: entry.id, type: entry.type, user_id: entry.user_id },
      actionType: 'download',
      currentUserId: ctx.currentUserId,
      effectiveRole: ctx.effectiveRole,
    });

    if (!consume.success) {
      return NextResponse.json(
        {
          success: false,
          error: consume.reason || '下载失败',
          required_points: consume.cost,
        },
        { status: consume.cost > 0 ? 402 : 500 }
      );
    }

    // 记录下载日志（失败静默）
    await logUserAction({
      userId: ctx.currentUserId!,
      actionType: 'download',
      actionDetails: {
        entry_id: entry.id,
        title: entry.title,
        own_file: isOwner,
        points_deducted: consume.cost,
        creator_share: consume.creatorShare,
        platform_share: consume.platformShare,
        via: 'signed_url',
      },
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: request.headers.get('user-agent'),
    });

    // 3. 解析存储路径与所属 bucket
    const storagePath = entry.storage_path || entry.file_key || extractStoragePathFromUrl(entry.file_url);
    if (!storagePath) {
      return NextResponse.json({ success: false, error: '文件路径不存在' }, { status: 404 });
    }
    const bucket = entry.storage_bucket || 'knowledge-base';

    // 4. 生成签名 URL（1 小时有效期，携带原始文件名触发下载）
    const displayName = entry.metadata?.original_file_name || entry.file_name || 'download';
    const downloadName = displayName.includes('.')
      ? displayName
      : `${displayName}.${entry.file_type?.split('/').pop() || 'bin'}`;

    const { data: signedData, error: signedError } = await db.storage
      .from(bucket)
      .createSignedUrl(storagePath, 3600, { download: downloadName });

    if (signedError || !signedData?.signedUrl) {
      console.error('[Knowledge Download-Url API] 生成签名 URL 失败:', bucket, storagePath, signedError);
      return NextResponse.json(
        { success: false, error: '文件不存在或已失效，请联系管理员' },
        { status: 404 }
      );
    }

    // 5. 返回签名 URL + 文件名 + 扣费信息
    return NextResponse.json({
      success: true,
      url: signedData.signedUrl,
      fileName: downloadName,
      expiresIn: 3600,
      bucket,
      path: storagePath,
      deductedPoints: consume.cost,
    });
  } catch (error: any) {
    console.error('[Knowledge Download-Url API] 异常:', error);
    return NextResponse.json({ success: false, error: '生成下载链接失败' }, { status: 500 });
  }
}
