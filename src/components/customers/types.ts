/** 客户资料（管理后台/用户端共用） */
export interface Customer {
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
  payment_terms?: string | null;
  credit_limit?: number | string | null;
  notes?: string | null;
  /** 扩展字段：user_id / level / status / region / industry / tags / deleted_at */
  metadata?: Record<string, any>;
  /** 归属用户（admin API 关联返回） */
  owner?: {
    id: string;
    full_name?: string;
    username?: string;
    email?: string;
    role?: string;
  } | null;
  created_at?: string;
  updated_at?: string;
}

/** 客户关联报价记录 */
export interface CustomerQuote {
  id: string;
  quote_number?: string;
  status?: string;
  total_amount?: number | string;
  valid_until?: string;
  issued_at?: string;
  created_at?: string;
  customer_info?: Record<string, any>;
}

/** 统计概览 */
export interface CustomerStatsData {
  total: number;
  monthlyNew: number;
  activeCount: number;
  userStats?: Array<{
    userId: string;
    userName: string;
    customerCount: number;
    quoteCount: number;
    totalAmount: number | string | null;
  }>;
}

/** 用户下拉选项 */
export interface UserOption {
  id: string;
  name: string;
}

export const CUSTOMER_LEVELS = ['A', 'B', 'C', 'D'] as const;

export const CUSTOMER_STATUSES = [
  { value: 'active', label: '启用' },
  { value: 'disabled', label: '停用' },
] as const;

/** 跟进方式 */
export type FollowupType = 'call' | 'visit' | 'email' | 'wechat' | 'meeting' | 'other';

/** 跟进状态 */
export type FollowupStatus = 'pending' | 'completed' | 'cancelled';

/** 跟进记录 */
export interface Followup {
  id: string;
  customer_id: number;
  user_id: string;
  followup_type: string;
  content: string;
  next_followup_date: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  user?: {
    id: string;
    username?: string;
    full_name?: string;
    email?: string;
  } | null;
}

export const FOLLOWUP_TYPES = [
  { value: 'call', label: '电话' },
  { value: 'visit', label: '拜访' },
  { value: 'email', label: '邮件' },
  { value: 'wechat', label: '微信' },
  { value: 'meeting', label: '会议' },
  { value: 'other', label: '其他' },
] as const;

export const FOLLOWUP_STATUSES = [
  { value: 'pending', label: '待跟进' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' },
] as const;
