import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/auth-utils';
import { checkModulePermission } from '@/lib/permission-gate';
import { isUserAdminRole, loadAdminRoleCodes } from '@/lib/admin-role-helper';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * #20260831-1430-1 客户接口鉴权（P0-1 / P0-2 / P0-3 / P1）
 *
 * 1. 身份只从服务端签发/校验的凭据解析（httpOnly session_token cookie、
 *    HMAC 签名的 x-user-token、Supabase Bearer）——不再信任可伪造的 x-user-id 请求头，
 *    未认证一律 401，不再走「返回全部客户」的管理分支。
 * 2. 所有方法统一经过 checkModulePermission('customer_manage')（会员等级模块权限，
 *    管理员直通，DB 可配置）。
 * 3. 归属：普通用户只能看/改/删 metadata->>user_id = 自己的客户；
 *    无主客户（历史遗留，user_id 为空）仅管理员可操作。
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
        errorResponse ?? NextResponse.json({ error: '未认证' }, { status: 401 }),
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
    console.warn('[Customers API] 管理员角色判定失败，按普通用户处理:', error);
  }

  return {
    ok: true,
    access: { userId: user.id, role: user.role || 'user', isAdmin },
  };
}

/** 读取客户并校验归属（管理员放行；无主客户仅管理员） */
async function loadOwnedCustomer(
  id: string | number,
  access: CustomerAccess
): Promise<
  | { ok: true; customer: { id: number; metadata: Record<string, any> | null } }
  | { ok: false; response: NextResponse }
> {
  const supabase = getSupabaseClient();
  const { data: existing, error } = await supabase
    .from('customers')
    .select('id, metadata')
    .eq('id', id)
    .is('metadata->>deleted_at', null)
    .maybeSingle();

  if (error) throw error;
  if (!existing) {
    return { ok: false, response: NextResponse.json({ error: '客户不存在' }, { status: 404 }) };
  }

  const ownerId = existing.metadata?.user_id ?? null;

  if (ownerId && ownerId !== access.userId && !access.isAdmin) {
    return { ok: false, response: NextResponse.json({ error: '无权操作该客户' }, { status: 403 }) };
  }

  // P0-3：无主客户（user_id 为空的历史数据）仅管理员可操作，
  // 避免任意登录用户越权修改/删除他人历史客户
  if (!ownerId && !access.isAdmin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: '该客户暂无归属信息，仅管理员可操作', code: 'CUSTOMER_NO_OWNER' },
        { status: 403 }
      ),
    };
  }

  return { ok: true, customer: existing };
}

/** 清洗搜索词，避免破坏 PostgREST or() 语法（#202608311000 P2-9） */
function sanitizeSearch(search: string | null): string | null {
  if (!search) return null;
  return search.replace(/[,()'"\\]/g, '');
}

// GET - 获取客户列表（按用户隔离；管理员可见全部）
export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const { access } = auth;

  try {
    const search = sanitizeSearch(request.nextUrl.searchParams.get('search'));
    const supabase = getSupabaseClient();

    let query = supabase
      .from('customers')
      .select('*')
      .is('metadata->>deleted_at', null);

    if (access.isAdmin) {
      // 管理场景：全量客户（基线 #49 行为保持不变，判定改由角色驱动，不再依赖 x-user-id 请求头）
      query = query.order('created_at', { ascending: false });
    } else {
      // P0-2：普通用户仅能看到自己拥有的客户，无主客户不再跨用户可见
      query = query
        .eq('metadata->>user_id', access.userId)
        .order('updated_at', { ascending: false });
    }

    if (search) {
      query = query.or(
        `company_name.ilike.%${search}%,project_name.ilike.%${search}%,contact_person.ilike.%${search}%,phone.ilike.%${search}%`
      );
    }

    const { data: customers, error } = await query;
    if (error) throw error;

    return NextResponse.json({ customers: customers || [] });
  } catch (error: any) {
    console.error('获取客户列表失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '获取客户列表失败') }, { status: 500 });
  }
}

// POST - 添加新客户（归属写入当前登录用户）
export async function POST(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const { access } = auth;

  try {
    const body = await request.json();
    const supabase = getSupabaseClient();

    const incomingMetadata =
      body?.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

    const insertData: any = {
      company_name: body.companyName,
      // 归属由服务端写入，请求体无法伪造/覆盖
      metadata: { ...incomingMetadata, user_id: access.userId },
    };

    // 可选字段
    const fieldMap: Record<string, string> = {
      projectName: 'project_name', contactPerson: 'contact_person',
      phone: 'phone', email: 'email', address: 'address',
      bankName: 'bank_name', bankAccount: 'bank_account',
      taxNumber: 'tax_number', notes: 'notes',
      paymentTerms: 'payment_terms', creditLimit: 'credit_limit',
    };
    for (const [bodyKey, dbKey] of Object.entries(fieldMap)) {
      const val = (body as any)[bodyKey];
      if (val !== undefined && val !== '') {
        insertData[dbKey] = val;
      }
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .insert(insertData)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ customer }, { status: 201 });
  } catch (error: any) {
    console.error('添加客户失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '添加客户失败') }, { status: 500 });
  }
}

// DELETE - 软删除客户（归属校验）
export async function DELETE(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const { access } = auth;

  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    const owned = await loadOwnedCustomer(id, access);
    if (!owned.ok) return owned.response;

    const supabase = getSupabaseClient();
    const metadata = { ...(owned.customer.metadata || {}), deleted_at: new Date().toISOString() };
    const { error } = await supabase
      .from('customers')
      .update({ metadata, updated_at: new Date().toISOString() })
      .eq('id', owned.customer.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('删除客户失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '删除客户失败') }, { status: 500 });
  }
}

// PUT - 更新客户（归属校验）
export async function PUT(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return auth.response;
  const { access } = auth;

  try {
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    const owned = await loadOwnedCustomer(id, access);
    if (!owned.ok) return owned.response;

    const supabase = getSupabaseClient();
    const updateObj: any = { updated_at: new Date().toISOString() };

    const fieldMap: Record<string, string> = {
      companyName: 'company_name', projectName: 'project_name',
      contactPerson: 'contact_person', phone: 'phone', email: 'email',
      address: 'address', bankName: 'bank_name', bankAccount: 'bank_account',
      taxNumber: 'tax_number', notes: 'notes',
      paymentTerms: 'payment_terms', creditLimit: 'credit_limit',
    };
    for (const [bodyKey, dbKey] of Object.entries(fieldMap)) {
      const val = (updateData as any)[bodyKey];
      if (val !== undefined && val !== '') {
        updateObj[dbKey] = val;
      }
    }

    const { data: customer, error } = await supabase
      .from('customers')
      .update(updateObj)
      .eq('id', owned.customer.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ customer });
  } catch (error: any) {
    console.error('更新客户失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '更新客户失败') }, { status: 500 });
  }
}
