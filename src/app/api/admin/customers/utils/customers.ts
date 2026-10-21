import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/** 管理后台 Supabase 服务端客户端类型 */
export type AdminDb = ReturnType<typeof getSupabaseServiceClient>;

export interface CustomerListParams {
  search?: string;
  userId?: string;
  level?: string;
  status?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CustomerListResult {
  data: any[];
  total: number;
  page: number;
  pageSize: number;
}

const SORTABLE_COLUMNS = ['company_name', 'created_at', 'updated_at'];

/**
 * 查询客户列表（分页 / 搜索 / 筛选 / 排序）
 * 过滤软删除：metadata.deleted_at IS NULL
 */
export async function queryCustomerList(
  db: AdminDb,
  params: CustomerListParams
): Promise<CustomerListResult> {
  const { search = '', userId = '', level = '', status = '' } = params;
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize || 10));
  const sortBy = params.sortBy || 'created_at';
  const sortOrder = params.sortOrder === 'asc' ? 'asc' : 'desc';

  let query = db.from('customers').select('*', { count: 'exact' });
  query = query.is('metadata->>deleted_at', null);

  if (search) {
    // #202608311000 P2-8：清洗 or() 特殊字符，避免破坏 PostgREST 语法
    const safeSearch = search.replace(/[,()'"\\]/g, '');
    query = query.or(
      `company_name.ilike.%${safeSearch}%,contact_person.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`
    );
  }
  if (userId) query = query.eq('metadata->>user_id', userId);
  if (level) query = query.eq('metadata->>level', level);
  if (status) query = query.eq('metadata->>status', status);

  if (SORTABLE_COLUMNS.includes(sortBy)) {
    query = query.order(sortBy, { ascending: sortOrder === 'asc' });
  } else if (sortBy === 'level') {
    query = query.order('metadata->>level', { ascending: sortOrder === 'asc' });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.range(from, from + pageSize - 1);
  if (error) throw error;

  return { data: data || [], total: count || 0, page, pageSize };
}

/** 批量查询归属用户（metadata.user_id → users 表） */
export async function fetchUserMap(
  db: AdminDb,
  userIds: string[]
): Promise<Record<string, any>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (ids.length === 0) return {};
  const { data: users } = await db
    .from('users')
    .select('id, full_name, username, email, role')
    .in('id', ids);
  return Object.fromEntries((users || []).map((u) => [u.id, u]));
}

/** 为客户列表附加 owner 信息 */
export function attachOwners(customers: any[], userMap: Record<string, any>): any[] {
  return (customers || []).map((c) => ({
    ...c,
    owner: c.metadata?.user_id ? userMap[c.metadata.user_id] || null : null,
  }));
}

/** 查询单个归属用户 */
export async function fetchOwner(
  db: AdminDb,
  ownerId: string | undefined | null
): Promise<any | null> {
  if (!ownerId) return null;
  const { data: owner } = await db
    .from('users')
    .select('id, full_name, username, email, role, created_at')
    .eq('id', ownerId)
    .single();
  return owner || null;
}

/**
 * 查询客户关联报价：quotes.customer_info->>name / customer_info->>customer_name
 * 匹配 customers.company_name（quotes 表无 customer_id 外键）
 */
export async function fetchCustomerQuotes(
  db: AdminDb,
  companyName: string | null | undefined
): Promise<any[]> {
  if (!companyName) return [];
  const esc = (s: string) =>
    s.replace(/,/g, '\\,').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
  const { data, error } = await db
    .from('quotes')
    .select(
      'id, quote_number, status, total_amount, valid_until, issued_at, created_at, customer_info, metadata'
    )
    .or(
      `customer_info->>name.eq.${esc(companyName)},customer_info->>customer_name.eq.${esc(companyName)}`
    )
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw error;
  return data || [];
}
