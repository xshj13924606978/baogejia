/**
 * 贡献中心非产品资料库（技术文档库/案例库/标准规范库/图纸图片库/定额库）
 * 批量导入判重配置与条目处理助手
 * 创建时间: 2026-08-22
 *
 * 判重规则来源：数据库表 contributor_duplicate_configs（迁移 062），可维护，不硬编码。
 * 判重目标：与已通过（approved）的同类贡献资料判重，逻辑与产品价格库对齐。
 */

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { CONTRIBUTOR_FORM_DEFS, type ContributorType } from './types';

export interface ContributorDuplicateConfig {
  type: string;
  duplicateFields: string[];
  fieldLabels: Record<string, string>;
  isActive: boolean;
}

export interface UploadEntry {
  uploadId: string;
  index: number;
  fields: Record<string, unknown>;
}

/** 规范化比较值：去除首尾空格并转小写 */
export function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).trim().toLowerCase();
}

/** 从数据库加载某类型的判重配置；未配置或未启用时返回 null */
export async function getContributorDuplicateConfig(type: string): Promise<ContributorDuplicateConfig | null> {
  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('contributor_duplicate_configs')
    .select('type, duplicate_fields, field_labels, is_active')
    .eq('type', type)
    .maybeSingle();

  if (error || !data) return null;
  const fields: string[] = Array.isArray(data.duplicate_fields) ? data.duplicate_fields : [];
  if (!data.is_active || fields.length === 0) return null;

  return {
    type: data.type as string,
    duplicateFields: fields,
    fieldLabels:
      data.field_labels && typeof data.field_labels === 'object'
        ? (data.field_labels as Record<string, string>)
        : {},
    isActive: !!data.is_active,
  };
}

/** 构建判重规则描述文案 */
export function buildDuplicateRuleDescription(config: ContributorDuplicateConfig): string {
  const labels = config.duplicateFields.map((f) => config.fieldLabels[f] || f);
  return `当${labels.join('、')}都相同时，视为重复资料`;
}

/** 展开一条上传记录为条目数组（兼容单品模式与批量 items 模式） */
export function expandUploadEntries(upload: { id: string; data?: Record<string, unknown> | null }): UploadEntry[] {
  const data = upload.data ?? {};
  const items = Array.isArray(data.items) ? data.items : null;
  if (items && items.length > 0) {
    return items.map((item, i) => ({
      uploadId: upload.id,
      index: i,
      fields: item && typeof item === 'object' ? (item as Record<string, unknown>) : {},
    }));
  }
  return [{ uploadId: upload.id, index: 0, fields: data }];
}

/** 判断输入条目是否与已有条目在判重字段上完全匹配 */
export function isEntryDuplicate(
  input: Record<string, unknown>,
  existing: Record<string, unknown>,
  fields: string[]
): boolean {
  return fields.every((f) => {
    const a = normalizeValue(input[f]);
    const b = normalizeValue(existing[f]);
    return a !== '' && a === b;
  });
}

/** 在已通过的上传记录中查找与输入条目重复的条目 */
export function findDuplicateEntry(
  approvedUploads: { id: string; data?: Record<string, unknown> | null }[],
  input: Record<string, unknown>,
  fields: string[]
): UploadEntry | null {
  for (const upload of approvedUploads || []) {
    for (const entry of expandUploadEntries(upload)) {
      if (isEntryDuplicate(input, entry.fields, fields)) return entry;
    }
  }
  return null;
}

/** 为非产品类型构建表格字段映射弹窗的系统字段（排除附件字段） */
export function buildSystemFieldsForType(
  type: ContributorType
): { key: string; label: string; required: boolean }[] {
  const def = CONTRIBUTOR_FORM_DEFS[type];
  if (!def) return [];
  return def.fields
    .filter((f) => f.type !== 'file')
    .map((f) => ({ key: f.name, label: f.label, required: f.required }));
}
