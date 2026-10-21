/**
 * 内置标准条款库（#[20260827-1030]-6 第一层：专家规则层）
 *
 * 按业务分类索引常用环保标准，数据复用 knowledge/standards-db 的静态规范库
 * （未上传任何资料也可引用）。分类：
 * - 污水排放 / 污泥处理 / 设备制造 / 工程设计 / 电气设计 / 运行维护
 */

import {
  getStandardsByCategory,
  getRelatedStandards,
  standardsToMarkdown,
  type StandardEntry,
} from '../knowledge/standards-db';

export const STANDARD_CATEGORIES = [
  '污水排放',
  '污泥处理',
  '设备制造',
  '工程设计',
  '电气设计',
  '运行维护',
] as const;

export type StandardCategory = (typeof STANDARD_CATEGORIES)[number];

/** 分类 → 规范库 category 映射 */
const CATEGORY_MAP: Record<StandardCategory, StandardEntry['category'][]> = {
  污水排放: ['discharge', 'water-quality'],
  污泥处理: ['equipment'],
  设备制造: ['equipment'],
  工程设计: ['design'],
  电气设计: ['electrical'],
  运行维护: ['operation'],
};

/** 按业务分类获取标准 */
export function getByCategory(category: StandardCategory): StandardEntry[] {
  const targets = CATEGORY_MAP[category] ?? ['discharge'];
  const out: StandardEntry[] = [];
  for (const t of targets) {
    for (const e of getStandardsByCategory(t)) {
      if (!out.some((x) => x.code === e.code)) out.push(e);
    }
  }
  return out;
}

/** 按项目类型/工艺获取相关标准（规则层入口） */
export function getStandardsForProject(projectType: string, processType?: string): StandardEntry[] {
  return getRelatedStandards(projectType, processType);
}

/** 格式化为 Markdown 列表 */
export function standardsToMarkdownList(entries: StandardEntry[]): string {
  return standardsToMarkdown(entries);
}