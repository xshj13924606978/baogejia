// ============================
// 知识库统一类型定义
// ============================

/** 知识库类型 */
export type KnowledgeType = 'document' | 'case' | 'standard' | 'drawing' | 'quota';

/** 知识条目状态 */
export type KnowledgeStatus = 'pending' | 'approved' | 'rejected';

/** 前端乐观更新状态（仅用于 UI 显示，不会持久化） */
export type OptimisticStatus = KnowledgeStatus | 'uploading';

/** 知识条目（API 返回格式） */
export interface KnowledgeEntry {
  id: string;
  user_id: string;
  type: KnowledgeType;
  title: string;
  description: string;
  file_name: string;
  file_key: string;
  file_url: string;
  file_size: number | null;
  file_type: string | null;
  content: string | null;
  metadata: Record<string, any>;
  status: KnowledgeStatus | OptimisticStatus;
  reject_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  views: number;
  downloads: number;
  created_at: string;
  updated_at: string;
  // 前端附加字段
  uploader_name?: string;
  tags?: string[];
}

// ============================
// 各子库 metadata 接口
// ============================

/** 技术文档库 metadata */
export interface DocumentMetadata {
  category: string;       // 分类：产品说明书、技术文档、操作手册、维护指南
  source?: ImportSource;
  source_url?: string;
}

/** 案例库 metadata */
export interface CaseMetadata {
  project_type: string;   // 项目类型
  industry: string;       // 行业
  scale: string;          // 规模
  budget: string;         // 预算
  completion_date: string;// 完成日期
  source?: ImportSource;
  source_url?: string;
}

/** 标准规范库 metadata */
export interface StandardMetadata {
  standard_code: string;  // 编号：如 GB 50014-2021
  standard_type: string;  // 国标/行标/地标/企标
  industry: string;       // 行业
  publish_date: string;   // 发布日期
  effective_status: string; // 现行/废止/修订中
  source?: ImportSource;
  source_url?: string;
}

/** 图纸图片库 metadata */
export interface DrawingMetadata {
  drawing_type: string;   // CAD/工艺流程图/布置图/安装图/其他
  project: string;        // 所属项目
  version: string;        // 版本号
  source?: ImportSource;
  source_url?: string;
}

/** 定额库 metadata */
export interface QuotaMetadata {
  quota_type: string;     // 全国/地方/行业/企业
  region: string;         // 地区
  industry: string;       // 行业
  quota_code: string;     // 定额编号
  unit: string;           // 单位
  base_price: number;     // 基价
  labor_cost: number;     // 人工费
  material_cost: number;  // 材料费
  machine_cost: number;   // 机械费
  source?: ImportSource;
  source_url?: string;
}

/** 导入来源类型 */
export type ImportSource = 'local' | 'weblink' | 'clouddrive' | 'wechat' | 'email';

// ============================
// API 请求/响应类型
// ============================

export interface KnowledgeListParams {
  type?: string;
  keyword?: string;
  status?: string;
  page?: number;
  limit?: number;
  metadata_filter?: Record<string, any>;
  tag?: string;
}

export interface KnowledgeListResponse {
  success: boolean;
  data: KnowledgeEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface KnowledgeSearchResponse {
  success: boolean;
  results: Record<string, KnowledgeEntry[]>; // 按 type 分组
  total: number;
}

// ============================
// 标签类型
// ============================

export interface KnowledgeTag {
  id: string;
  name: string;
  created_at: string;
}

// ============================
// 各子库筛选选项
// ============================

export const DOCUMENT_CATEGORIES = ['产品说明书', '技术文档', '操作手册', '维护指南', '其他'];
export const CASE_PROJECT_TYPES = ['污水处理', '供水工程', '设备安装', '工业废水', '给排水', '其他'];
export const STANDARD_TYPES = ['国标', '行标', '地标', '企标'];
export const STANDARD_STATUSES = ['现行', '废止', '修订中'];
export const DRAWING_TYPES = ['CAD', '工艺流程图', '布置图', '安装图', '其他'];
export const QUOTA_TYPES = ['全国', '地方', '行业', '企业'];

// ============================
// 权限 code 映射
// ============================

const TYPE_PREFIX: Record<KnowledgeType, string> = {
  document: 'knowledge.doc',
  case: 'knowledge.case',
  standard: 'knowledge.standard',
  drawing: 'knowledge.drawing',
  quota: 'knowledge.quota',
};

export function getPermissionCode(type: KnowledgeType, action: string): string {
  return `${TYPE_PREFIX[type]}.${action}`;
}

// ============================
// 微信/邮件导入类型（接口框架）
// ============================

/** 微信消息导入请求 */
export interface WeChatImportRequest {
  source: 'wechat';
  message_id: string;
  content: string;
  sender_id: string;
  file_urls?: string[];
  type: KnowledgeType;
  metadata?: Record<string, any>;
  tags?: string[];
}

/** 邮件导入请求 */
export interface EmailImportRequest {
  source: 'email';
  email_id: string;
  subject: string;
  sender_email: string;
  body_text?: string;
  body_html?: string;
  attachments?: Array<{
    filename: string;
    content_type: string;
    size: number;
    url: string;
  }>;
  type: KnowledgeType;
  metadata?: Record<string, any>;
  tags?: string[];
}

/** 导入 Webhook 配置 */
export interface ImportWebhookConfig {
  enabled: boolean;
  secret_token: string;
  auto_approve: boolean;
  default_type: KnowledgeType;
  default_tags: string[];
}
