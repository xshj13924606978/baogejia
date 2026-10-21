import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { resolveAuthContext, normalizeRole } from '@/lib/knowledge/api-utils';
import { getUserPermissions } from '@/lib/permission/permission-service';
import { getDownloadCostValue, DEFAULT_DOWNLOAD_COSTS } from '@/lib/knowledge/points-download';

/**
 * 用户端知识库查询 API
 *
 * GET /api/knowledge?type=document&keyword=xxx&page=1&limit=20
 *
 * 参数：
 * - scope=public（默认）：只返回已审核通过的条目（公共列表）
 * - scope=mine：只返回当前用户自己的条目（全部状态，用于“我的上传”）
 * - include_mine=true：兼容旧参数，等同于在 public 结果中附加自己的非 approved 条目
 * - 支持 type/keyword/metadata_filter/tag 筛选
 */

export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type') || '';
    const keyword = searchParams.get('keyword') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const metadataFilter = searchParams.get('metadata_filter');
    const tagFilter = searchParams.get('tag') || '';
    const includeMine = searchParams.get('include_mine') === 'true';
    const scope = searchParams.get('scope') || '';

    // 统一认证 + 降级检测
    const ctx = await resolveAuthContext(request);
    const { currentUserId, effectiveRole: normalizedRole, isAuthenticated } = ctx;

    // scope=mine: 只返回当前用户自己的条目（全部状态）
    // 超管可以看到所有人的上传，其他用户只能看自己的
    if (scope === 'mine') {
      // 权限校验：未真实认证时返回空数据
      if (!isAuthenticated) {
        return NextResponse.json({
          success: true, data: [], total: 0, page, limit, scope: 'mine',
          authenticated: false,
          permissions: { can_download: false, download_cost: 5 },
        });
      }

      let query = db
        .from('knowledge_entries')
        .select('*', { count: 'exact' });

      // 非超管：强制按 user_id 过滤，只能看自己的
      if (normalizedRole !== 'super_admin') {
        query = query.eq('user_id', currentUserId);
      }
      if (type) query = query.eq('type', type);
      if (keyword) query = query.ilike('title', `%${keyword}%`);
      if (metadataFilter) {
        try {
          const filterObj = JSON.parse(metadataFilter);
          if (Object.keys(filterObj).length > 0) {
            query = query.contains('metadata', filterObj);
          }
        } catch { /* ignore */ }
      }

      const mineOffset = (page - 1) * limit;
      const { data: mineData, error: mineError, count: mineCount } = await query
        .order('created_at', { ascending: false })
        .range(mineOffset, mineOffset + limit - 1);

      if (mineError) {
        console.error('[Knowledge API] scope=mine 查询失败:', mineError.message);
        return NextResponse.json({ success: true, data: [], total: 0, page, limit });
      }

      // 批量获取上传者信息
      const userIds = [...new Set((mineData || []).map((item: any) => item.user_id).filter(Boolean))];
      let userMap: Record<string, string> = {};
      if (userIds.length > 0) {
        try {
          const { data: users } = await db.from('users').select('id, username, full_name').in('id', userIds);
          if (users) users.forEach((u: any) => { userMap[u.id] = u.full_name || u.username || u.id; });
        } catch { /* ignore */ }
      }

      // 批量获取 tags
      const entryIds = (mineData || []).map((item: any) => item.id);
      let tagMap: Record<string, string[]> = {};
      if (entryIds.length > 0) {
        try {
          const { data: tagRelations } = await db
            .from('knowledge_entry_tags')
            .select('entry_id, tag_id, knowledge_tags(name)')
            .in('entry_id', entryIds);
          if (tagRelations) {
            tagRelations.forEach((r: any) => {
              if (!tagMap[r.entry_id]) tagMap[r.entry_id] = [];
              if (r.knowledge_tags?.name) tagMap[r.entry_id].push(r.knowledge_tags.name);
            });
          }
        } catch { /* ignore */ }
      }

      let filteredData = mineData || [];
      if (tagFilter && entryIds.length > 0) {
        filteredData = filteredData.filter((item: any) => (tagMap[item.id] || []).includes(tagFilter));
      }

      // scope=mine 返回完整信息（包含所有状态）
      const formatted = filteredData.map((item: any) => ({
        id: item.id, user_id: item.user_id, type: item.type, title: item.title,
        description: item.description || '', file_name: item.file_name, file_key: item.file_key,
        file_url: item.file_url, file_size: item.file_size, file_type: item.file_type,
        content: item.content, metadata: item.metadata || {}, status: item.status,
        reject_reason: item.reject_reason || null, reviewed_by: item.reviewed_by || null,
        reviewed_at: item.reviewed_at || null, views: item.views || 0, downloads: item.downloads || 0,
        uploader_name: userMap[item.user_id] || '未知', tags: tagMap[item.id] || [],
        created_at: item.created_at, updated_at: item.updated_at,
      }));

      // 权限检查（scope=mine 进入时 isAuthenticated=true）
      const perms = await getUserPermissions(currentUserId || '', normalizedRole);
      const canView = perms.actions['knowledge:view'] ?? false;
      const canDownload = perms.actions['knowledge:download'] ?? false;
      const canEdit = perms.actions['knowledge:edit'] ?? false;
      const canDelete = perms.actions['knowledge:delete'] ?? false;

      // 按资源类型读取扣费配置（points_download_config，角色可覆盖）
      let downloadCost = 0;
      let viewCost = 0;
      try {
        downloadCost = await getDownloadCostValue(db, type, 'download', normalizedRole);
        viewCost = await getDownloadCostValue(db, type, 'view', normalizedRole);
      } catch { /* ignore */ }

      return NextResponse.json({
        success: true, data: formatted,
        total: tagFilter ? formatted.length : (mineCount || 0),
        page, limit, scope: 'mine',
        authenticated: true,
        permissions: {
          can_view: canView, can_download: canDownload, can_edit: canEdit, can_delete: canDelete,
          download_cost: downloadCost,
          view_cost: viewCost,
          download_costs: { ...DEFAULT_DOWNLOAD_COSTS },
        },
      });
    }

    // scope=public（默认）：根据角色过滤可见范围
    // - 未登录: 只看 approved
    // - super_admin: 看全部（含 pending/rejected）
    // - admin: 看 approved + 自己的 pending/rejected
    // - 其他登录用户: 看 approved + 自己的 pending/rejected
    let query = db
      .from('knowledge_entries')
      .select('*', { count: 'exact' });

    if (!isAuthenticated) {
      // 未真实认证（无header/cookie）：只看 approved
      query = query.eq('status', 'approved');
    } else if (normalizedRole === 'super_admin') {
      // 超管：看全部，不加 status 过滤
    } else if (ctx.isDevFallback) {
      // 降级模式：mock ID 共享 fallback 用户的数据，只看 approved 避免越权
      query = query.eq('status', 'approved');
    } else {
      // admin/vip/premium/free/enterprise 等：approved + 自己的 pending/rejected
      query = query.or(`status.eq.approved,and(user_id.eq.${currentUserId},status.in.(pending,rejected))`);
    }

    if (type) query = query.eq('type', type);
    if (keyword) query = query.ilike('title', `%${keyword}%`);
    if (metadataFilter) {
      try {
        const filterObj = JSON.parse(metadataFilter);
        if (Object.keys(filterObj).length > 0) {
          query = query.contains('metadata', filterObj);
        }
      } catch { /* ignore */ }
    }

    const offset = (page - 1) * limit;
    const { data: approvedData, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Knowledge API] 查询失败:', error.message);
      return NextResponse.json({ success: true, data: [], total: 0, page, limit });
    }

    // 公共列表严格只返回 approved 条目，不混合任何非 approved 数据
    const allData = approvedData || [];

    // 批量获取上传者信息
    const userIds = [...new Set(allData.map((item: any) => item.user_id).filter(Boolean))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      try {
        const { data: users } = await db
          .from('users')
          .select('id, username, full_name')
          .in('id', userIds);
        if (users) {
          users.forEach((u: any) => {
            userMap[u.id] = u.full_name || u.username || u.id;
          });
        }
      } catch { /* ignore */ }
    }

    // 批量获取 tags
    const entryIds = allData.map((item: any) => item.id);
    let tagMap: Record<string, string[]> = {};
    if (entryIds.length > 0) {
      try {
        const { data: tagRelations } = await db
          .from('knowledge_entry_tags')
          .select('entry_id, tag_id, knowledge_tags(name)')
          .in('entry_id', entryIds);
        if (tagRelations) {
          tagRelations.forEach((r: any) => {
            if (!tagMap[r.entry_id]) tagMap[r.entry_id] = [];
            if (r.knowledge_tags?.name) {
              tagMap[r.entry_id].push(r.knowledge_tags.name);
            }
          });
        }
      } catch { /* ignore */ }
    }

    // 按 tag 筛选
    let filteredData = allData;
    if (tagFilter && entryIds.length > 0) {
      filteredData = filteredData.filter((item: any) =>
        (tagMap[item.id] || []).includes(tagFilter)
      );
    }

    // 格式化数据（公共列表：包含 status 等字段，以便前端展示状态标签）
    const formatted = filteredData.map((item: any) => {
      return {
        id: item.id, user_id: item.user_id, type: item.type, title: item.title,
        description: item.description || '', file_name: item.file_name, file_key: item.file_key,
        file_url: item.file_url, file_size: item.file_size, file_type: item.file_type,
        content: item.content, metadata: item.metadata || {}, status: item.status || 'approved',
        reject_reason: item.reject_reason || null,
        views: item.views || 0, downloads: item.downloads || 0,
        uploader_name: userMap[item.user_id] || '未知', tags: tagMap[item.id] || [],
        created_at: item.created_at, updated_at: item.updated_at,
      };
    });

    // 去重
    const seen = new Set<string>();
    const unique = formatted.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    // 检查当前用户的资料权限：查看 / 下载 / 编辑 / 删除
    const perms = await getUserPermissions(currentUserId || '', normalizedRole);
    const canView = perms.actions['knowledge:view'] ?? false;
    const canDownload = perms.actions['knowledge:download'] ?? false;
    const canEdit = perms.actions['knowledge:edit'] ?? false;
    const canDelete = perms.actions['knowledge:delete'] ?? false;

    // 未认证用户强制关闭下载
    const effectiveCanDownload = isAuthenticated ? canDownload : false;

    // 按资源类型读取扣费配置（points_download_config，角色可覆盖）
    let downloadCost = 0;
    let viewCost = 0;
    try {
      downloadCost = await getDownloadCostValue(db, type, 'download', normalizedRole);
      viewCost = await getDownloadCostValue(db, type, 'view', normalizedRole);
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      data: unique,
      total: count || 0,
      page,
      limit,
      permissions: {
        can_view: canView,
        can_download: effectiveCanDownload,
        can_edit: canEdit,
        can_delete: canDelete,
        download_cost: downloadCost,
        view_cost: viewCost,
        download_costs: { ...DEFAULT_DOWNLOAD_COSTS },
      },
    });
  } catch (error: any) {
    console.error('[Knowledge API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取知识列表失败' }, { status: 500 });
  }
}
