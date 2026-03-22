/**
 * 权限覆盖 CRUD - 集合路由
 * GET  /api/admin/permission-overrides   - 查询权限覆盖规则（支持 target_type/target_id/permission_type 筛选）
 * POST /api/admin/permission-overrides   - 创建权限覆盖规则（支持批量 upsert）
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { clearCacheByTarget } from '@/lib/permission/permission-service';
import { withAdmin } from '@/lib/permission-check';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const sp = request.nextUrl.searchParams;
    const target_type = sp.get('target_type') || '';
    const target_id = sp.get('target_id') || '';
    const permission_type = sp.get('permission_type') || '';
    const page = parseInt(sp.get('page') || '1');
    const limit = parseInt(sp.get('limit') || '200');

    const db = getSupabaseServiceClient();
    let query = db.from('permission_overrides').select('*', { count: 'exact' });

    if (target_type) query = query.eq('target_type', target_type);
    if (target_id) query = query.eq('target_id', target_id);
    if (permission_type) query = query.eq('permission_type', permission_type);

    const offset = (page - 1) * limit;
    const { data, error, count } = await query
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, limit });
  } catch (error) {
    console.error('[PermissionOverrides] GET 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});

export const POST = withAdmin(async (request: NextRequest, user: any) => {
  try {
    const body = await request.json();
    const db = getSupabaseServiceClient();

    // 支持单条或批量
    const rules = Array.isArray(body) ? body : [body];

    // 自动设置优先级
    const priorityMap: Record<string, number> = { user: 5, role: 10, level: 20 };
    const rows = rules.map((r: any) => ({
      target_type: r.target_type,
      target_id: String(r.target_id),
      permission_type: r.permission_type,
      permission_key: r.permission_key,
      is_visible: r.is_visible !== undefined ? Boolean(r.is_visible) : null,
      is_editable: r.is_editable !== undefined ? Boolean(r.is_editable) : null,
      priority: r.priority ?? priorityMap[r.target_type] ?? 10,
      created_by: user?.id || null,
    }));

    // 校验
    for (const r of rows) {
      if (!r.target_type || !r.target_id || !r.permission_type || !r.permission_key) {
        return NextResponse.json(
          { success: false, error: 'target_type, target_id, permission_type, permission_key 不能为空' },
          { status: 400 }
        );
      }
      if (!['user', 'level', 'role'].includes(r.target_type)) {
        return NextResponse.json(
          { success: false, error: 'target_type 必须是 user/level/role 之一' },
          { status: 400 }
        );
      }
      if (!['module', 'page', 'field', 'action'].includes(r.permission_type)) {
        return NextResponse.json(
          { success: false, error: 'permission_type 必须是 module/page/field/action 之一' },
          { status: 400 }
        );
      }
    }

    const { data, error } = await db
      .from('permission_overrides')
      .upsert(rows, { onConflict: 'target_type,target_id,permission_type,permission_key' })
      .select();

    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    // 清除相关用户缓存
    const uniqueTargets = new Set<string>();
    rows.forEach((r: any) => uniqueTargets.add(`${r.target_type}:${r.target_id}`));
    for (const t of uniqueTargets) {
      const [type, id] = t.split(':');
      await clearCacheByTarget(type, id);
    }

    // 记录变更日志
    try {
      const logRows = rows.map((r: any) => ({
        admin_id: user?.id || null,
        target_type: r.target_type,
        target_id: r.target_id,
        change_type: 'add',
        permission_type: r.permission_type,
        permission_key: r.permission_key,
        new_value: { is_visible: r.is_visible, is_editable: r.is_editable },
      }));
      await db.from('permission_change_logs').insert(logRows);
    } catch { /* 日志记录失败不影响主流程 */ }

    return NextResponse.json({
      success: true,
      message: `成功保存 ${data?.length || 0} 条规则`,
      data,
    });
  } catch (error) {
    console.error('[PermissionOverrides] POST 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
