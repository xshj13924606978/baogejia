import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { getUserPermissions } from '@/lib/permission/permission-service';
import { consumeKnowledgeResource } from '@/lib/knowledge/points-download';
import { logUserAction } from '@/lib/user-log-service';
// #202608302400 阶段2 P0-4：模块权限拦截网关
import { checkModulePermission } from '@/lib/permission-gate';

/**
 * 知识库文件下载 API
 *
 * POST /api/knowledge/download
 * Body: { entryId: string }
 *
 * 1. 检查用户等级权限（knowledge.download）
 * 2. 按 资源类型+角色 读取扣费配置（points_download_config）
 * 3. 原子扣减积分（自上传不扣分）
 * 4. 非自上传资源按比例分成（70% 上传者 / 30% 平台），写入 points_split_records
 * 5. 通过服务角色从 Storage 拉取文件并以流式响应返回，避免 public/signed URL 受 bucket policy 影响
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
    // 如果 pathname 不是标准格式，返回空由调用方处理
    return '';
  } catch {
    return '';
  }
}

export async function POST(request: NextRequest) {
  const { entryId } = await request.json().catch(() => ({}));
  if (!entryId) {
    return NextResponse.json({ success: false, error: '缺少 entryId' }, { status: 400 });
  }
  return handleKnowledgeDownload(request, entryId);
}

/**
 * 知识文件下载核心逻辑（POST 批量下载 与 GET 直接下载共用）
 * - GET /api/knowledge/download/:id（#[20260827-1430]：资料中心匹配卡片直接下载）
 */
export async function handleKnowledgeDownload(request: NextRequest, entryId: string): Promise<NextResponse> {
  try {
    const ctx = await resolveAuthContext(request);
    if (!ctx.isAuthenticated) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const normalizedRole = ctx.effectiveRole;

    const db = getSupabaseServiceClient();

    // 1. 获取条目信息
    const { data: entry, error: fetchError } = await db
      .from('knowledge_entries')
      .select('id, title, file_url, file_name, file_key, file_size, file_type, status, user_id, type, metadata')
      .eq('id', entryId)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    // 非approved文件：只有超管和上传者本人可下载
    if (entry.status !== 'approved' && entry.user_id !== ctx.currentUserId && normalizedRole !== 'super_admin') {
      return NextResponse.json({ success: false, error: '该条目尚未通过审核' }, { status: 403 });
    }

    // 2. 检查用户角色资料下载权限（自上传文件跳过）
    if (entry.user_id !== ctx.currentUserId) {
      const perms = await getUserPermissions(ctx.currentUserId || '', normalizedRole);
      const canDownload = perms.actions['knowledge:download'] ?? false;
      if (!canDownload) {
        return NextResponse.json({ success: false, error: '当前角色无下载权限' }, { status: 403 });
      }

      // 2.1 等级模块权限（#202608302400 阶段2 P0-4）：knowledge_download
      //     与上面的 RBAC 角色权限叠加，任一不满足即拒绝
      const modulePerm = await checkModulePermission({
        userId: ctx.currentUserId || '',
        moduleKey: 'knowledge_download',
        role: normalizedRole,
      });
      if (!modulePerm.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: modulePerm.reason || '当前等级无下载权限',
            code: 'MODULE_PERMISSION_DENIED',
            module: 'knowledge_download',
            moduleLabel: modulePerm.moduleLabel,
            currentLevel: modulePerm.level,
            currentLevelName: modulePerm.levelName,
            requiredLevel: modulePerm.requiredLevel,
            requiredLevelName: modulePerm.requiredLevelName,
            upgradeHint: modulePerm.upgradeHint,
          },
          { status: 403 }
        );
      }
    }

    // 3. 扣费 + 分成（自上传不扣分；按资源类型+角色读取 points_download_config）
    const consume = await consumeKnowledgeResource({
      db,
      entry: { id: entry.id, type: entry.type, user_id: entry.user_id },
      actionType: 'download',
      currentUserId: ctx.currentUserId,
      effectiveRole: normalizedRole,
    });

    if (!consume.success) {
      return NextResponse.json({
        success: false,
        error: consume.reason || '下载失败',
        required_points: consume.cost,
      }, { status: consume.cost > 0 ? 402 : 500 });
    }

    // 5. 通过服务角色直接从 Storage 拉取文件并流式返回
    const fileKey = entry.file_key || extractStoragePathFromUrl(entry.file_url);
    if (!fileKey) {
      return NextResponse.json({ success: false, error: '文件路径不存在' }, { status: 500 });
    }

    const { data: fileBlob, error: downloadError } = await db.storage
      .from('knowledge-base')
      .download(fileKey);

    if (downloadError || !fileBlob) {
      console.error('[Knowledge Download API] Storage 下载失败:', fileKey, downloadError);
      return NextResponse.json(
        { success: false, error: '文件不存在或已失效，请联系管理员' },
        { status: 404 }
      );
    }

    // 校验下载内容大小，防止 Storage 返回空/损坏对象
    const remoteSize = fileBlob.size;
    if (entry.file_size && remoteSize !== entry.file_size) {
      console.error(
        `[Knowledge Download API] 文件大小不一致: key=${fileKey}, db=${entry.file_size}, storage=${remoteSize}`
      );
      return NextResponse.json(
        { success: false, error: '文件内容异常，请联系管理员' },
        { status: 500 }
      );
    }

    const arrayBuffer = await fileBlob.arrayBuffer();

    // 记录下载日志（失败静默）
    await logUserAction({
      userId: ctx.currentUserId!,
      actionType: 'download',
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

    const headers = new Headers();
    headers.set('Content-Type', entry.file_type || 'application/octet-stream');
    const displayName = entry.metadata?.original_file_name || entry.file_name;
    const downloadName = displayName
      ? `${displayName}${displayName.includes('.') ? '' : `.${entry.file_type?.split('/').pop() || 'bin'}`}`
      : 'download';
    headers.set(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    );
    headers.set('Content-Length', String(arrayBuffer.byteLength));

    return new NextResponse(arrayBuffer, { headers });
  } catch (error: any) {
    console.error('[Knowledge Download API] 异常:', error);
    return NextResponse.json({ success: false, error: '下载失败' }, { status: 500 });
  }
}
