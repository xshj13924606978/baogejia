import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

/**
 * 获取当前请求的用户 ID（兼容多种认证方式，优先 x-user-id header）
 */
async function getUserId(request: NextRequest): Promise<string | null> {
  const xUserId = request.headers.get('x-user-id');
  if (xUserId) return xUserId;

  try {
    const { getCurrentUser } = await import('@/lib/auth-utils');
    const user = await getCurrentUser(request);
    return user?.id || null;
  } catch {
    return null;
  }
}

// GET - 获取客户列表（按用户隔离，兼容旧数据）
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const searchParams = request.nextUrl.searchParams;
    const search = searchParams.get('search');

    const supabase = getSupabaseClient();

    if (userId) {
      // 有用户ID：查询该用户的数据 + 无user_id的旧数据（兼容过渡）
      const [userResult, legacyResult] = await Promise.all([
        supabase
          .from('customers')
          .select('*')
          .eq('metadata->>user_id', userId)
          .order('updated_at', { ascending: false }),
        supabase
          .from('customers')
          .select('*')
          .is('metadata->>user_id', null)
          .order('updated_at', { ascending: false }),
      ]);

      // 合并并去重（按id）
      const allCustomers = [...(userResult.data || []), ...(legacyResult.data || [])];
      const seen = new Set<number>();
      const customers = allCustomers.filter((c: any) => {
        if (seen.has(c.id)) return false;
        seen.add(c.id);
        return true;
      });

      // 搜索过滤
      let result = customers;
      if (search) {
        const s = search.toLowerCase();
        result = customers.filter((c: any) =>
          (c.company_name || '').toLowerCase().includes(s) ||
          (c.project_name || '').toLowerCase().includes(s) ||
          (c.contact_person || '').toLowerCase().includes(s) ||
          (c.phone || '').toLowerCase().includes(s)
        );
      }

      return NextResponse.json({ customers: result || [] });
    } else {
      // 无用户ID：返回所有客户（管理场景）
      let query = supabase.from('customers').select('*').order('created_at', { ascending: false });
      if (search) {
        query = query.or(
          `company_name.ilike.%${search}%,project_name.ilike.%${search}%,contact_person.ilike.%${search}%,phone.ilike.%${search}%`
        );
      }
      const { data: customers, error } = await query;
      if (error) throw error;
      return NextResponse.json({ customers: customers || [] });
    }
  } catch (error: any) {
    console.error('获取客户列表失败:', error);
    return NextResponse.json({ error: error.message || '获取客户列表失败' }, { status: 500 });
  }
}

// POST - 添加新客户（带用户隔离）
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const body = await request.json();

    const supabase = getSupabaseClient();

    const insertData: any = {
      company_name: body.companyName,
      metadata: { user_id: userId, ...body.metadata },
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
    return NextResponse.json({ error: error.message || '添加客户失败' }, { status: 500 });
  }
}

// DELETE - 删除客户（验证用户权限）
export async function DELETE(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

    const supabase = getSupabaseClient();
    let query = supabase.from('customers').delete().eq('id', id);

    // 用户隔离
    if (userId) {
      query = query.eq('metadata->>user_id', userId);
    }

    const { error } = await query;

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('删除客户失败:', error);
    return NextResponse.json({ error: error.message || '删除客户失败' }, { status: 500 });
  }
}

// PUT - 更新客户（验证用户权限）
export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const body = await request.json();
    const { id, ...updateData } = body;

    if (!id) {
      return NextResponse.json({ error: '缺少客户ID' }, { status: 400 });
    }

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

    let query = supabase.from('customers').update(updateObj).eq('id', id);
    if (userId) {
      query = query.eq('metadata->>user_id', userId);
    }

    const { data: customer, error } = await query.select().single();

    if (error) throw error;

    return NextResponse.json({ customer });
  } catch (error: any) {
    console.error('更新客户失败:', error);
    return NextResponse.json({ error: error.message || '更新客户失败' }, { status: 500 });
  }
}
