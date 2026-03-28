import React from 'react';
import type { KnowledgeType } from '@/types/knowledge';

/**
 * 根据知识库类型返回需要展示的 metadata 列配置
 * 用于管理端 knowledge-library.tsx 表格
 */

interface MetadataColumnConfig {
  key: string;
  label: string;
  render: (value: any) => React.ReactNode;
}

const COLUMN_CONFIGS: Record<string, MetadataColumnConfig[]> = {
  document: [
    { key: 'category', label: '分类', render: (v) => v || '-' },
  ],
  case: [
    { key: 'project_type', label: '项目类型', render: (v) => v || '-' },
    { key: 'industry', label: '行业', render: (v) => v || '-' },
    { key: 'scale', label: '规模', render: (v) => v || '-' },
    { key: 'budget', label: '预算', render: (v) => v ? <span className="text-red-600">{v}</span> : '-' },
    { key: 'completion_date', label: '完成日期', render: (v) => v || '-' },
  ],
  standard: [
    { key: 'standard_code', label: '标准编号', render: (v) => v ? <span className="font-mono text-xs">{v}</span> : '-' },
    { key: 'standard_type', label: '类型', render: (v) => v || '-' },
    { key: 'industry', label: '行业', render: (v) => v || '-' },
    { key: 'publish_date', label: '发布日期', render: (v) => v || '-' },
    { key: 'effective_status', label: '状态', render: (v) => {
      if (!v) return '-';
      const colors: Record<string, string> = {
        '现行': 'text-green-600 bg-green-50',
        '废止': 'text-red-600 bg-red-50',
        '修订中': 'text-orange-600 bg-orange-50',
      };
      return <span className={`px-2 py-0.5 rounded text-xs ${colors[v] || ''}`}>{v}</span>;
    }},
  ],
  drawing: [
    { key: 'drawing_type', label: '图纸类型', render: (v) => v || '-' },
    { key: 'project', label: '所属项目', render: (v) => v || '-' },
    { key: 'version', label: '版本', render: (v) => v || '-' },
  ],
  quota: [
    { key: 'quota_code', label: '定额编号', render: (v) => v ? <span className="font-mono text-xs">{v}</span> : '-' },
    { key: 'quota_type', label: '类型', render: (v) => v || '-' },
    { key: 'unit', label: '单位', render: (v) => v || '-' },
    { key: 'base_price', label: '基价', render: (v) => v != null ? Number(v).toFixed(2) : '-' },
    { key: 'labor_cost', label: '人工费', render: (v) => v != null ? Number(v).toFixed(2) : '-' },
    { key: 'material_cost', label: '材料费', render: (v) => v != null ? Number(v).toFixed(2) : '-' },
    { key: 'machine_cost', label: '机械费', render: (v) => v != null ? Number(v).toFixed(2) : '-' },
  ],
};

export function getMetadataColumns(type: string): MetadataColumnConfig[] {
  return COLUMN_CONFIGS[type] || [];
}
