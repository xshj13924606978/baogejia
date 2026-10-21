'use client';

import type { KnowledgeType } from '@/types/knowledge';
import {
  DOCUMENT_CATEGORIES,
  CASE_PROJECT_TYPES,
  STANDARD_TYPES,
  STANDARD_STATUSES,
  DRAWING_TYPES,
  QUOTA_TYPES,
} from '@/types/knowledge';

interface MetadataFormProps {
  type: KnowledgeType;
  value: Record<string, any>;
  onChange: (metadata: Record<string, any>) => void;
  disabled?: boolean;
}

const FIELD_CONFIGS: Record<KnowledgeType, Array<{
  key: string;
  label: string;
  type: 'select' | 'text' | 'date' | 'number';
  options?: string[];
  placeholder?: string;
}>> = {
  document: [
    { key: 'category', label: '分类', type: 'select', options: DOCUMENT_CATEGORIES },
  ],
  case: [
    { key: 'project_type', label: '项目类型', type: 'select', options: CASE_PROJECT_TYPES },
    { key: 'industry', label: '行业', type: 'text', placeholder: '如：环保工程' },
    { key: 'scale', label: '规模', type: 'text', placeholder: '如：5000m³/d' },
    { key: 'budget', label: '预算', type: 'text', placeholder: '如：1200万元' },
    { key: 'completion_date', label: '完成日期', type: 'date' },
  ],
  standard: [
    { key: 'standard_code', label: '标准编号', type: 'text', placeholder: '如：GB 50014-2021' },
    { key: 'standard_type', label: '标准类型', type: 'select', options: STANDARD_TYPES },
    { key: 'industry', label: '行业', type: 'text', placeholder: '如：建筑给排水' },
    { key: 'publish_date', label: '发布日期', type: 'date' },
    { key: 'effective_status', label: '实施状态', type: 'select', options: STANDARD_STATUSES },
  ],
  drawing: [
    { key: 'drawing_type', label: '图纸类型', type: 'select', options: DRAWING_TYPES },
    { key: 'project', label: '所属项目', type: 'text', placeholder: '项目名称' },
    { key: 'version', label: '版本号', type: 'text', placeholder: '如：V1.0' },
  ],
  quota: [
    { key: 'quota_type', label: '定额类型', type: 'select', options: QUOTA_TYPES },
    { key: 'region', label: '地区', type: 'text', placeholder: '如：全国、广东' },
    { key: 'industry', label: '行业', type: 'text', placeholder: '如：环保工程' },
    { key: 'quota_code', label: '定额编号', type: 'text', placeholder: '如：D1-001' },
    { key: 'unit', label: '单位', type: 'text', placeholder: '如：m³、台' },
    { key: 'base_price', label: '基价', type: 'number' },
    { key: 'labor_cost', label: '人工费', type: 'number' },
    { key: 'material_cost', label: '材料费', type: 'number' },
    { key: 'machine_cost', label: '机械费', type: 'number' },
  ],
};

export default function MetadataForm({ type, value, onChange, disabled }: MetadataFormProps) {
  const fields = FIELD_CONFIGS[type] || [];

  if (fields.length === 0) return <></>;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-700 border-b pb-1">分类信息</p>
      {fields.map(field => (
        <div key={field.key}>
          <label className="block text-xs text-gray-500 mb-1">{field.label}</label>
          {field.type === 'select' && field.options ? (
            <select
              value={value[field.key] || ''}
              onChange={e => onChange({ ...value, [field.key]: e.target.value })}
              disabled={disabled}
              className="w-full border rounded p-1.5 text-sm"
            >
              <option value="">请选择</option>
              {field.options.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          ) : field.type === 'date' ? (
            <input
              type="date"
              value={value[field.key] || ''}
              onChange={e => onChange({ ...value, [field.key]: e.target.value })}
              disabled={disabled}
              className="w-full border rounded p-1.5 text-sm"
            />
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={value[field.key] || ''}
              onChange={e => onChange({ ...value, [field.key]: field.type === 'number' ? Number(e.target.value) || 0 : e.target.value })}
              placeholder={field.placeholder}
              disabled={disabled}
              className="w-full border rounded p-1.5 text-sm"
            />
          )}
        </div>
      ))}
    </div>
  );
}

