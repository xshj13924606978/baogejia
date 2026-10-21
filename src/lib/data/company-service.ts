/**
 * 公司信息服务（#[20260827-1030]-7）
 *
 * 公司信息库 = 供方信息（本公司在报价/方案中展示的主体信息）。
 * 数据表：public.company_info（一个用户可维护一个默认公司）
 *
 * 目标：方案/报价中的供方信息一律来自数据库，杜绝硬编码。
 */
import { getSupabaseClient } from '@/lib/supabase';

export interface CompanyInfo {
  id: number;
  company_name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  tax_id?: string | null;
  bank_name?: string | null;
  bank_account?: string | null;
  website?: string | null;
  logo_url?: string | null;
  is_default: boolean;
  user_id?: string | null;
  updated_at?: string;
}

export interface CompanyInfoInput {
  company_name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  tax_id?: string;
  bank_name?: string;
  bank_account?: string;
  website?: string;
  logo_url?: string;
}

/** 获取默认公司信息（优先当前用户；无则取全局默认） */
export async function getDefaultCompany(userId?: string): Promise<CompanyInfo | null> {
  try {
    const db = getSupabaseClient();

    if (userId) {
      const { data: userRows } = await db
        .from('company_info')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('updated_at', { ascending: false })
        .limit(1);
      if (userRows && userRows.length > 0) return userRows[0] as CompanyInfo;
    }

    const { data: globalRows } = await db
      .from('company_info')
      .select('*')
      .eq('is_default', true)
      .order('updated_at', { ascending: false })
      .limit(1);
    return (globalRows && globalRows.length > 0 ? globalRows[0] : null) as CompanyInfo | null;
  } catch (e) {
    console.warn('[company-service] 获取公司信息失败:', e);
    return null;
  }
}

/** 列出公司信息（可按用户过滤） */
export async function listCompanies(userId?: string): Promise<CompanyInfo[]> {
  try {
    const db = getSupabaseClient();
    let query = db.from('company_info').select('*').order('updated_at', { ascending: false }).limit(50);
    if (userId) query = query.eq('user_id', userId);
    const { data } = await query;
    return (data as CompanyInfo[]) || [];
  } catch (e) {
    console.warn('[company-service] 列出公司信息失败:', e);
    return [];
  }
}

/** 新增或更新公司信息（同一用户仅保留一个默认公司） */
export async function upsertCompany(
  userId: string | undefined,
  input: CompanyInfoInput
): Promise<CompanyInfo | null> {
  try {
    const db = getSupabaseClient();
    const payload = {
      company_name: input.company_name,
      contact_person: input.contact_person ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      address: input.address ?? null,
      tax_id: input.tax_id ?? null,
      bank_name: input.bank_name ?? null,
      bank_account: input.bank_account ?? null,
      website: input.website ?? null,
      logo_url: input.logo_url ?? null,
      is_default: true,
      user_id: userId ?? null,
      updated_at: new Date().toISOString(),
    };

    // 用户已有记录 → 更新；否则新增
    let existing: CompanyInfo | null = null;
    if (userId) {
      const { data: rows } = await db.from('company_info').select('id').eq('user_id', userId).limit(1);
      existing = rows && rows.length > 0 ? (rows[0] as CompanyInfo) : null;
    }
    if (!existing) {
      const { data: anyDefault } = await db
        .from('company_info')
        .select('id')
        .eq('is_default', true)
        .limit(1);
      existing = anyDefault && anyDefault.length > 0 ? (anyDefault[0] as CompanyInfo) : null;
    }

    if (existing) {
      const { data, error } = await db
        .from('company_info')
        .update(payload)
        .eq('id', existing.id)
        .select()
        .single();
      if (error) throw error;
      return data as CompanyInfo;
    }

    const { data, error } = await db.from('company_info').insert(payload).select().single();
    if (error) throw error;
    return data as CompanyInfo;
  } catch (e) {
    console.warn('[company-service] 保存公司信息失败:', e);
    return null;
  }
}

/** 删除公司信息 */
export async function deleteCompany(id: number): Promise<boolean> {
  try {
    const db = getSupabaseClient();
    const { error } = await db.from('company_info').delete().eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

/** 将公司信息格式化为方案"供方信息"章节文本 */
export function companyToProposalText(company: CompanyInfo | null): string {
  if (!company || !company.company_name) {
    return '供方信息待补充（可在"公司信息"中维护后自动带入）';
  }
  const lines: string[] = [`公司名称：${company.company_name}`];
  if (company.contact_person) lines.push(`联系人：${company.contact_person}`);
  if (company.phone) lines.push(`联系电话：${company.phone}`);
  if (company.email) lines.push(`邮箱：${company.email}`);
  if (company.address) lines.push(`地址：${company.address}`);
  if (company.tax_id) lines.push(`统一社会信用代码：${company.tax_id}`);
  if (company.bank_name && company.bank_account) lines.push(`开户行及账号：${company.bank_name} ${company.bank_account}`);
  if (company.website) lines.push(`网址：${company.website}`);
  return lines.join('\n');
}
