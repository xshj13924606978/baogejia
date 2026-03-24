/**
 * 权限树 API
 * GET /api/admin/permission-tree
 * 返回全项目的 模块 → 页面 → 字段 → 按钮 树形结构
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';

interface TreeNode {
  key: string;
  label: string;
  type: 'module' | 'page' | 'field' | 'action';
  children?: TreeNode[];
  defaultVisible: boolean;
  defaultEditable?: boolean;
  override?: { visible?: boolean; editable?: boolean };
}

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const sp = request.nextUrl.searchParams;
    const targetType = sp.get('targetType') || '';
    const targetId = sp.get('targetId') || '';

    const db = getSupabaseServiceClient();

    // 并行加载所有配置数据
    const [modulesRes, pagesRes, fieldsRes, actionsRes] = await Promise.all([
      db.from('system_modules').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
      db.from('system_pages').select('*').eq('is_enabled', true).order('sort_order', { ascending: true }),
      db.from('system_fields').select('*').order('sort_order', { ascending: true }),
      db.from('system_actions').select('*').order('sort_order', { ascending: true }),
    ]);

    const modules = modulesRes.data || [];
    const pages = pagesRes.data || [];
    const fields = fieldsRes.data || [];
    const actions = actionsRes.data || [];

    // 查询该目标的覆盖规则
    let overrides: Record<string, any> = {};
    if (targetType && targetId) {
      const { data: overrideRows } = await db
        .from('permission_overrides')
        .select('*')
        .eq('target_type', targetType)
        .eq('target_id', targetId);
      for (const r of overrideRows || []) {
        overrides[`${r.permission_type}:${r.permission_key}`] = {
          visible: r.is_visible,
          editable: r.is_editable,
        };
      }
    }

    // 构建页面映射
    const pagesByModule = new Map<string, any[]>();
    for (const p of pages) {
      const list = pagesByModule.get(p.module_id) || [];
      list.push(p);
      pagesByModule.set(p.module_id, list);
    }

    // 构建字段映射
    const fieldsByPage = new Map<string, any[]>();
    for (const f of fields) {
      const list = fieldsByPage.get(f.page_id) || [];
      list.push(f);
      fieldsByPage.set(f.page_id, list);
    }

    // 构建按钮映射
    const actionsByPage = new Map<string, any[]>();
    for (const a of actions) {
      const list = actionsByPage.get(a.page_id) || [];
      list.push(a);
      actionsByPage.set(a.page_id, list);
    }

    // 构建树
    const tree: TreeNode[] = modules.map((m: any) => {
      const modulePages = pagesByModule.get(m.id) || [];
      const moduleOverride = overrides[`module:${m.module_code}`];

      return {
        key: m.module_code,
        label: m.module_name,
        type: 'module' as const,
        defaultVisible: m.is_visible_in_menu !== false,
        override: moduleOverride ? { visible: moduleOverride.visible } : undefined,
        children: [
          // 页面节点
          ...modulePages.map((p: any) => {
            const pageFields = fieldsByPage.get(p.id) || [];
            const pageActions = actionsByPage.get(p.id) || [];
            const pageOverride = overrides[`page:${p.page_key}`];

            return {
              key: p.page_key,
              label: p.name_zh,
              type: 'page' as const,
              defaultVisible: true,
              override: pageOverride ? { visible: pageOverride.visible } : undefined,
              children: [
                // 字段节点
                ...pageFields.map((f: any) => {
                  const fieldOverride = overrides[`field:${f.field_key}`];
                  return {
                    key: f.field_key,
                    label: f.label_zh,
                    type: 'field' as const,
                    defaultVisible: f.is_visible !== false,
                    defaultEditable: f.is_editable !== false,
                    override: fieldOverride,
                  };
                }),
                // 按钮节点
                ...pageActions.map((a: any) => {
                  const actionOverride = overrides[`action:${a.action_key}`];
                  return {
                    key: a.action_key,
                    label: a.name_zh,
                    type: 'action' as const,
                    defaultVisible: a.is_visible !== false,
                    override: actionOverride ? { visible: actionOverride.visible } : undefined,
                  };
                }),
              ],
            };
          }),
        ],
      };
    });

    return NextResponse.json({ success: true, data: tree });
  } catch (error) {
    console.error('[PermissionTreeAPI] 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
