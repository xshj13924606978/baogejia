/**
 * 方案持久化服务（#[20260827-1030]-7）
 *
 * 方案历史记录表 public.proposal_history：
 *   - 方案内容、数据来源快照、元信息可追溯
 *   - 版本号支持版本管理
 */
import { getSupabaseClient } from '@/lib/supabase';

export interface ProposalRecord {
  id: number;
  user_id?: string | null;
  customer_name?: string | null;
  project_type?: string | null;
  capacity?: number | null;
  total_price?: number | null;
  content?: string | null;
  data_sources?: any[] | null;
  meta?: Record<string, any> | null;
  status: string;
  version: number;
  created_at?: string;
  updated_at?: string;
}

export interface SaveProposalInput {
  userId?: string;
  customerName?: string;
  projectType?: string;
  capacity?: number;
  totalPrice?: number;
  content?: string;
  dataSources?: any[];
  meta?: Record<string, any>;
}

/** 保存方案到历史记录 */
export async function saveProposal(input: SaveProposalInput): Promise<ProposalRecord | null> {
  try {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('proposal_history')
      .insert({
        user_id: input.userId ?? null,
        customer_name: input.customerName ?? null,
        project_type: input.projectType ?? null,
        capacity: input.capacity ?? null,
        total_price: input.totalPrice ?? null,
        content: input.content ?? null,
        data_sources: input.dataSources ?? [],
        meta: input.meta ?? {},
        status: 'draft',
        version: 1,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProposalRecord;
  } catch (e) {
    console.warn('[proposal-storage] 保存方案失败:', e);
    return null;
  }
}

/** 查询方案历史（按用户，默认最近 20 条） */
export async function getProposalHistory(userId?: string, limit = 20): Promise<ProposalRecord[]> {
  try {
    const db = getSupabaseClient();
    let query = db
      .from('proposal_history')
      .select('id, user_id, customer_name, project_type, capacity, total_price, status, version, created_at, meta')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (userId) query = query.eq('user_id', userId);
    const { data } = await query;
    return (data as ProposalRecord[]) || [];
  } catch (e) {
    console.warn('[proposal-storage] 查询方案历史失败:', e);
    return [];
  }
}

/** 查询方案详情（含完整内容与数据来源） */
export async function getProposalById(id: number): Promise<ProposalRecord | null> {
  try {
    const db = getSupabaseClient();
    const { data } = await db.from('proposal_history').select('*').eq('id', id).single();
    return (data as ProposalRecord) || null;
  } catch (e) {
    console.warn('[proposal-storage] 查询方案详情失败:', e);
    return null;
  }
}

/** 更新方案状态 */
export async function updateProposalStatus(id: number, status: string): Promise<boolean> {
  try {
    const db = getSupabaseClient();
    const { error } = await db
      .from('proposal_history')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id);
    return !error;
  } catch {
    return false;
  }
}

/** 删除方案记录 */
export async function deleteProposal(id: number, userId?: string): Promise<boolean> {
  try {
    const db = getSupabaseClient();
    let query = db.from('proposal_history').delete().eq('id', id);
    if (userId) query = query.eq('user_id', userId);
    const { error } = await query;
    return !error;
  } catch {
    return false;
  }
}
