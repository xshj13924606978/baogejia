/**
 * 客户资料服务（#[20260827-1030]-7）
 *
 * 客户资料库沿用既有 customers 表（id/company_name/project_name/contact_person/phone/
 * email/address/bank_name/bank_account/tax_number/notes/payment_terms/credit_limit/metadata），
 * 用户隔离通过 metadata.user_id，软删除通过 metadata.deleted_at。
 */
import { getSupabaseClient } from '@/lib/supabase';

export interface CustomerRow {
  id: number;
  company_name: string;
  project_name?: string | null;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  tax_number?: string | null;
  notes?: string | null;
  payment_terms?: string | null;
  credit_limit?: number | null;
  metadata?: Record<string, any> | null;
  created_at?: string;
  updated_at?: string;
}

export interface CustomerInput {
  company_name: string;
  project_name?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  industry?: string;
  bank_name?: string;
  bank_account?: string;
  tax_number?: string;
  notes?: string;
  payment_terms?: string;
  credit_limit?: number;
}

/** 列出客户（按用户隔离，兼容无 user_id 的旧数据） */
export async function listCustomers(userId?: string, keyword?: string): Promise<CustomerRow[]> {
  try {
    const db = getSupabaseClient();
    let query = db
      .from('customers')
      .select('*')
      .is('metadata->>deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (userId) {
      query = query.or(`metadata->>user_id.eq.${userId},metadata->>user_id.is.null`);
    }
    if (keyword) {
      query = query.or(
        `company_name.ilike.%${keyword}%,project_name.ilike.%${keyword}%,contact_person.ilike.%${keyword}%,phone.ilike.%${keyword}%`
      );
    }
    const { data } = await query;
    return (data as CustomerRow[]) || [];
  } catch (e) {
    console.warn('[customer-service] 列出客户失败:', e);
    return [];
  }
}

/** 新增客户 */
export async function createCustomer(
  userId: string | undefined,
  input: CustomerInput
): Promise<CustomerRow | null> {
  try {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('customers')
      .insert({
        company_name: input.company_name,
        project_name: input.project_name ?? null,
        contact_person: input.contact_person ?? null,
        phone: input.phone ?? null,
        email: input.email ?? null,
        address: input.address ?? null,
        bank_name: input.bank_name ?? null,
        bank_account: input.bank_account ?? null,
        tax_number: input.tax_number ?? null,
        notes: input.notes ?? null,
        payment_terms: input.payment_terms ?? null,
        credit_limit: input.credit_limit ?? null,
        metadata: {
          user_id: userId ?? null,
          industry: input.industry ?? null,
        },
      })
      .select()
      .single();
    if (error) throw error;
    return data as CustomerRow;
  } catch (e) {
    console.warn('[customer-service] 新增客户失败:', e);
    return null;
  }
}

/** 更新客户 */
export async function updateCustomer(
  id: number,
  userId: string | undefined,
  patch: Partial<CustomerInput>
): Promise<CustomerRow | null> {
  try {
    const db = getSupabaseClient();
    const updateObj: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };
    const fieldMap: Record<string, string> = {
      company_name: 'company_name',
      project_name: 'project_name',
      contact_person: 'contact_person',
      phone: 'phone',
      email: 'email',
      address: 'address',
      bank_name: 'bank_name',
      bank_account: 'bank_account',
      tax_number: 'tax_number',
      notes: 'notes',
      payment_terms: 'payment_terms',
      credit_limit: 'credit_limit',
    };
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      const col = fieldMap[k] || k;
      updateObj[col] = v;
    }
    let query = db.from('customers').update(updateObj).eq('id', id);
    if (userId) query = query.eq('metadata->>user_id', userId);
    const { data, error } = await query.select().single();
    if (error) throw error;
    return data as CustomerRow;
  } catch (e) {
    console.warn('[customer-service] 更新客户失败:', e);
    return null;
  }
}

/** 软删除客户 */
export async function deleteCustomer(id: number, userId?: string): Promise<boolean> {
  try {
    const db = getSupabaseClient();
    const { data: existing } = await db
      .from('customers')
      .select('id, metadata')
      .eq('id', id)
      .single();
    if (!existing) return false;
    const ownerId = (existing.metadata as any)?.user_id;
    if (ownerId && ownerId !== userId) return false;
    const { error } = await db
      .from('customers')
      .update({
        metadata: { ...(existing.metadata || {}), deleted_at: new Date().toISOString() },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
}
