import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { fetchCustomerQuotes } from '../../admin/customers/utils/customers';
import { requireAuth } from '@/lib/auth-utils';
import { checkModulePermission } from '@/lib/permission-gate';
import { isUserAdminRole, loadAdminRoleCodes } from '@/lib/admin-role-helper';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * #20260831-1430-1 客户详情鉴权（P0-1 / P0-2 / P1）
 *
 * 未认证 → 401；无 customer_manage 模块权限 → 403；
 * 非本人客户 → 403；无主客户（user_id 为空）仅管理员可见。
 */
type CustomerAccess = {
  userId: string;
  role: string;
  isAdmin: boolean;
};

type AccessResult =
  | { ok: true; access: CustomerAccess }
  | { ok: false; response: NextResponse };

/** 登录校验 + 模块权限校验 + 管理员判定 */
async function authorize(request: NextRequest): Promise<AccessResult> {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse || !user) {
    return {
      ok: false,
      response:
        errorResponse ??
        NextResponse.json({ success: false, error: '未认证', code: 'UNAUTHORIZED' }, { status: 401 }),
    };
  }

  const permission = await checkModulePermission({
    userId: user.id,
    moduleKey: 'customer_manage',
    role: user.role,
  });

  if (!permission.allowed) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          success: false,
          error: permission.reason || '无「客户管理」权限',
          code: 'MODULE_PERMISSION_DENIED',
          module: permission.moduleKey,
          moduleLabel: permission.moduleLabel,
          currentLevelName: permission.levelName,
          requiredLevelName: permission.requiredLevelName,
          upgradeHint: permission.upgradeHint,
          source: permission.source,
        },
        { status: 403 }
      ),
    };
  }

  let isAdmin = false;
  try {
    const adminCodes = await loadAdminRoleCodes(getSupabaseServiceClient());
    isAdmin = isUserAdminRole(user.role, adminCodes);
  } catch (error) {
    console.warn('[Customer Detail API] 管理员角色判定失败，按普通用户处理:', error);
  }

  return {
    ok: true,
    access: { userId: user.id, role: user.role || 'user', isAdmin },
  };
}

/**
 * 用户端 - 客户详情
 *
 * GET /api/customers/:id
 * 返回 { success: true, data: { ...customer, quotes } }
 *
 * 可见性：管理员 → 全部；普通用户 → 仅 metadata.user_id == 当前用户
 * 无主客户（user_id 为空）不再对任意登录用户可见
 * 软删除客户不可见
 */

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) {
    return NextResponse.json({ success: false, error: '无效的客户ID' }, { status: 400 });
  }

  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const { access } = auth;

  const supabase = getSupabaseClient();

  try {
    const { data: customer, error } = await supabase
      .from('customers')
      .select('*')
      .eq('id', Number(id))
      .is('metadata->>deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!customer) {
      return NextResponse.json({ success: false, error: '客户不存在' }, { status: 404 });
    }

    const ownerId = customer.metadata?.user_id ?? null;

    if (ownerId && ownerId !== access.userId && !access.isAdmin) {
      return NextResponse.json({ success: false, error: '无权访问该客户' }, { status: 403 });
    }

    // P0-2：无主客户仅管理员可见（历史遗留数据由迁移 122 分配归属）
    if (!ownerId && !access.isAdmin) {
      return NextResponse.json(
        { success: false, error: '该客户暂无归属信息，仅管理员可访问', code: 'CUSTOMER_NO_OWNER' },
        { status: 403 }
      );
    }

    const quotes = await fetchCustomerQuotes(supabase, customer.company_name);

    return NextResponse.json({ success: true, data: { ...customer, quotes } });
  } catch (e: any) {
    console.error('[User Customer Detail] GET error:', e);
    return NextResponse.json(
      { success: false, error: e.message || '查询客户详情失败' },
      { status: 500 }
    );
  }
}
