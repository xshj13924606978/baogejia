import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';
import { safeErrorMessage } from '@/lib/error-handler';

async function getUserId(request: NextRequest): Promise<string | null> {
  const xUserId = request.headers.get('x-user-id');
  if (xUserId) return xUserId;
  try {
    const { getCurrentUser } = await import('@/lib/auth-utils');
    const user = await getCurrentUser(request);
    return user?.id || null;
  } catch { return null; }
}

// 前端 camelCase → 数据库 snake_case 字段映射
const FIELD_MAP: Record<string, string> = {
  companyName: 'company_name', contactPerson: 'contact_person',
  phone: 'phone', email: 'email', address: 'address',
  bankName: 'bank_name', bankAccount: 'bank_account',
  taxNumber: 'tax_id', taxId: 'tax_id',
  website: 'website', logo: 'logo', logoUrl: 'logo_url',
};

function toSupplier(row: any) {
  return {
    id: String(row.id),
    companyName: row.company_name || '',
    contactPerson: row.contact_person || '',
    phone: row.phone || '',
    email: row.email || '',
    address: row.address || '',
    bankName: row.bank_name || '',
    bankAccount: row.bank_account || '',
    taxNumber: row.tax_id || '',
    website: row.website || '',
    logo: row.logo || '',
    logoUrl: row.logo_url || '',
    isDefault: !!row.metadata?.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function buildDbData(body: any, userId: string | null) {
  const dbData: any = {
    metadata: { user_id: userId, is_default: body.isDefault || false },
  };
  for (const [bodyKey, dbKey] of Object.entries(FIELD_MAP)) {
    const val = (body as any)[bodyKey];
    if (val !== undefined && val !== '') {
      dbData[dbKey] = val;
    }
  }
  return dbData;
}

// GET - 获取供应方列表
export async function GET(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const search = request.nextUrl.searchParams.get('search');
    const supabase = getSupabaseClient();

    let result: any[];

    if (userId) {
      const [userResult, legacyResult] = await Promise.all([
        supabase.from('suppliers').select('*').eq('metadata->>user_id', userId).order('updated_at', { ascending: false }),
        supabase.from('suppliers').select('*').is('metadata->>user_id', null).order('updated_at', { ascending: false }),
      ]);
      const all = [...(userResult.data || []), ...(legacyResult.data || [])];
      const seen = new Set<number>();
      result = all.filter((c: any) => { if (seen.has(c.id)) return false; seen.add(c.id); return true; });
    } else {
      const { data } = await supabase.from('suppliers').select('*').order('updated_at', { ascending: false });
      result = data || [];
    }

    if (search) {
      const s = search.toLowerCase();
      result = result.filter((r: any) =>
        (r.company_name || '').toLowerCase().includes(s) ||
        (r.contact_person || '').toLowerCase().includes(s) ||
        (r.phone || '').toLowerCase().includes(s)
      );
    }

    return NextResponse.json({ suppliers: result.map(toSupplier) });
  } catch (error: any) {
    console.error('获取供应方列表失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '获取供应方列表失败') }, { status: 500 });
  }
}

// POST - 添加供应方
export async function POST(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const body = await request.json();
    const supabase = getSupabaseClient();

    const insertData = buildDbData(body, userId);
    insertData.company_name = body.companyName || '未设置';

    // 如果设为默认，先清除其他默认
    if (body.isDefault && userId) {
      const { data: existing } = await supabase.from('suppliers').select('id,metadata').eq('metadata->>user_id', userId);
      if (existing) {
        for (const row of existing) {
          const meta = row.metadata || {};
          if (meta.is_default) {
            await supabase.from('suppliers').update({ metadata: { ...meta, is_default: false } }).eq('id', row.id);
          }
        }
      }
    }

    const { data, error } = await supabase.from('suppliers').insert(insertData).select().single();
    if (error) throw error;

    return NextResponse.json({ supplier: toSupplier(data) }, { status: 201 });
  } catch (error: any) {
    console.error('添加供应方失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '添加供应方失败') }, { status: 500 });
  }
}

// PUT - 更新供应方
export async function PUT(request: NextRequest) {
  try {
    const userId = await getUserId(request);
    const body = await request.json();
    const { id, ...rest } = body;

    if (!id) return NextResponse.json({ error: '缺少供应方ID' }, { status: 400 });

    const supabase = getSupabaseClient();
    const updateData: any = { updated_at: new Date().toISOString() };

    for (const [bodyKey, dbKey] of Object.entries(FIELD_MAP)) {
      const val = (rest as any)[bodyKey];
      if (val !== undefined) updateData[dbKey] = val;
    }
    // 处理 is_default — 只更新 is_default 字段，不覆盖整个 metadata
    if (rest.isDefault !== undefined) {
      updateData.metadata = { is_default: rest.isDefault };
    }

    // 先查询记录是否存在，以及其 metadata 中的 user_id
    const { data: existingRow } = await supabase.from('suppliers').select('id,metadata').eq('id', id).single();
    if (!existingRow) {
      return NextResponse.json({ error: '供应方不存在' }, { status: 404 });
    }

    // 验证归属：如果记录有 user_id 且与当前用户不匹配，拒绝更新
    const existingUserId = existingRow.metadata?.user_id;
    if (existingUserId && userId && existingUserId !== userId) {
      return NextResponse.json({ error: '无权更新此供应方' }, { status: 403 });
    }

    // 合并 metadata：保留原有字段，只更新指定字段
    if (updateData.metadata) {
      updateData.metadata = { ...existingRow.metadata, ...updateData.metadata };
      // 如果当前用户有 userId 且记录没有，补上
      if (userId && !updateData.metadata.user_id) {
        updateData.metadata.user_id = userId;
      }
    }

    const { data, error } = await supabase.from('suppliers').update(updateData).eq('id', id).select().single();
    if (error) throw error;

    // 如果设为默认，清除其他记录的默认标记
    if (rest.isDefault && userId) {
      const { data: others } = await supabase.from('suppliers').select('id,metadata').eq('metadata->>user_id', userId).neq('id', id);
      if (others) {
        for (const row of others) {
          const meta = row.metadata || {};
          if (meta.is_default) {
            await supabase.from('suppliers').update({ metadata: { ...meta, is_default: false } }).eq('id', row.id);
          }
        }
      }
    }

    // 广播供应方信息更新
    const supplier = toSupplier(data);
    if (supplier.isDefault) {
      // 通知其他组件
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/api/suppliers`, {
          headers: userId ? { 'x-user-id': userId } : {},
        });
        if (res.ok) {
          const result = await res.json();
          const defaultSupplier = (result.suppliers || []).find((s: any) => s.isDefault);
          if (defaultSupplier) {
            // 缓存默认供应方到 localStorage 供其他组件使用
            // 这里通过 metadata 更新实现，其他组件会重新加载
          }
        }
      } catch (err) {
        console.warn('[suppliers] 重新加载供应方列表失败:', err);
      }
    }

    return NextResponse.json({ supplier });
  } catch (error: any) {
    console.error('更新供应方失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '更新供应方失败') }, { status: 500 });
  }
}

// DELETE - 删除供应方
export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');
    if (!id) return NextResponse.json({ error: '缺少供应方ID' }, { status: 400 });

    const supabase = getSupabaseClient();
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('删除供应方失败:', error);
    return NextResponse.json({ error: safeErrorMessage(error, '删除供应方失败') }, { status: 500 });
  }
}
