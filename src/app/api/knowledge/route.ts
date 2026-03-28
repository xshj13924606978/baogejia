import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 用户端知识库查询 API
 *
 * GET /api/knowledge?type=document&keyword=xxx&page=1&limit=20&include_mine=true
 * - 默认只返回 status = 'approved' 的条目
 * - include_mine=true 时，额外返回当前用户自己的所有状态条目
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

    // 获取当前用户（可选）
    let currentUserId: string | null = null;
    if (includeMine) {
      try {
        const currentUser = await getCurrentUser(request);
        if (currentUser?.id) currentUserId = currentUser.id;
      } catch { /* 未登录忽略 */ }
    }

    // 主查询：已审核通过的条目
    let query = db
      .from('knowledge_entries')
      .select('*', { count: 'exact' })
      .eq('status', 'approved');

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

    // 额外查询：当前用户自己的非 approved 条目
    let myPendingData: any[] = [];
    if (currentUserId && type) {
      try {
        const { data } = await db
          .from('knowledge_entries')
          .select('*')
          .eq('user_id', currentUserId)
          .eq('type', type)
          .neq('status', 'approved')
          .order('created_at', { ascending: false });
        myPendingData = data || [];
      } catch { /* ignore */ }
    }

    // 合并数据（用户的非 approved 条目置顶）
    const allData = [...myPendingData, ...(approvedData || [])];

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

    // 格式化数据（非 approved 条目只返回标题和状态，不暴露文件信息）
    const formatted = filteredData.map((item: any) => {
      if (item.status !== 'approved') {
        // 只返回 uploader 自己能看到的摘要信息
        return {
          id: item.id,
          user_id: item.user_id,
          type: item.type,
          title: item.title,
          status: item.status,
          reject_reason: item.reject_reason || null,
          created_at: item.created_at,
          updated_at: item.updated_at,
        };
      }
      return {
        id: item.id,
        user_id: item.user_id,
        type: item.type,
        title: item.title,
        description: item.description || '',
        file_name: item.file_name,
        file_key: item.file_key,
        file_url: item.file_url,
        file_size: item.file_size,
        file_type: item.file_type,
        content: item.content,
        metadata: item.metadata || {},
        status: item.status,
        reject_reason: null,
        views: item.views || 0,
        downloads: item.downloads || 0,
        uploader_name: userMap[item.user_id] || '未知',
        tags: tagMap[item.id] || [],
        created_at: item.created_at,
        updated_at: item.updated_at,
      };
    });

    // 去重 + 隐私过滤：非 approved 条目只保留当前用户自己的
    const seen = new Set<string>();
    const unique = formatted.filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      // 非通过条目必须是当前用户自己的，其他人不可见
      if (item.status !== 'approved' && currentUserId && item.user_id !== currentUserId) {
        return false;
      }
      return true;
    });

    // 检查当前用户的下载权限
    let canDownload = true;
    if (currentUserId) {
      try {
        const { data: userRecord } = await db
          .from('users')
          .select('metadata')
          .eq('id', currentUserId)
          .single();
        const userLevel = userRecord?.metadata?.level || 1;

        const { data: overrides } = await db
          .from('permission_overrides')
          .select('is_visible')
          .eq('target_type', 'level')
          .eq('target_id', String(userLevel))
          .eq('permission_type', 'action')
          .eq('permission_key', 'knowledge.download')
          .limit(1);

        if (overrides && overrides.length > 0) {
          canDownload = overrides[0].is_visible !== false;
        }
      } catch { /* 权限查询失败时默认允许 */ }
    }

    // 获取下载积分规则
    let downloadCost = 5;
    try {
      const { data: rule } = await db
        .from('points_rules')
        .select('base_points, rule_config')
        .eq('rule_key', 'knowledge_download_cost')
        .eq('is_active', true)
        .single();
      if (rule) {
        downloadCost = rule.rule_config?.base_cost || Math.abs(rule.base_points || 5);
      }
    } catch { /* ignore */ }

    return NextResponse.json({
      success: true,
      data: unique,
      total: includeMine ? unique.length : (count || 0),
      page,
      limit,
      permissions: { can_download: canDownload, download_cost: downloadCost },
    });
  } catch (error: any) {
    console.error('[Knowledge API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取知识列表失败' }, { status: 500 });
  }
}
