/**
 * 会员等级字段权限 / 模块权限 定义（唯一顺序来源）
 * 供服务层与前端共享，杜绝硬编码
 * 对话窗: [#20260824-MEMBERSHIP-OPT]
 */

import { LEVEL_BADGE_CLASS, LEVEL_CODE_TO_NUM_MAP, LEVEL_METAS } from './level-constants';

export const FIELD_PERMISSION_DEFS: { field_key: string; field_label: string }[] = [
  { field_key: 'can_view_min_price', field_label: '最低售价' },
  { field_key: 'can_view_cost_price', field_label: '成本价' },
  { field_key: 'can_view_manufacturer', field_label: '厂家' },
  { field_key: 'can_view_contact', field_label: '联系人' },
  { field_key: 'can_view_phone', field_label: '电话' },
];

/**
 * 模块权限定义（后台「等级权限配置」页展示 + 业务拦截网关共用）
 *
 * #202608302400 阶段2：补充 4 个业务模块，使模块权限能在真实业务接口中生效（P0-4）
 *   原仅有 5 个模块（chat/quote_generate/history/edit/preview），
 *   而方案增强、资料下载、数据导出、客户管理等业务接口无任何等级拦截。
 */
export const MODULE_PERMISSION_DEFS: { module_key: string; module_label: string }[] = [
  { module_key: 'chat', module_label: '智能对话' },
  { module_key: 'quote_generate', module_label: '报价生成' },
  { module_key: 'history', module_label: '历史记录' },
  { module_key: 'edit', module_label: '编辑' },
  { module_key: 'preview', module_label: '预览' },
  // ↓ 阶段2 新增（对应真实业务接口）
  { module_key: 'enhance_proposal', module_label: '方案增强' },
  { module_key: 'knowledge_download', module_label: '资料下载' },
  { module_key: 'data_export', module_label: '数据导出' },
  { module_key: 'customer_manage', module_label: '客户管理' },
  // ↓ #20260901-0900 P2-2 新增（统计报表接口）
  { module_key: 'report_view', module_label: '报表查看' },
];

/**
 * 模块默认权限矩阵（DB 未配置该模块时的回退）
 *
 * #202608302500：由 permission-gate.ts 下沉到本文件（唯一来源）。
 *   原位置在服务端模块（import next/server / auth-utils），客户端组件
 *   「等级权限配置」页引用它会把服务端代码打进浏览器包，因此下沉到纯常量文件。
 * 数组索引 0-4 依次对应 L0 用户 / L1 会员 / L2 白银 / L3 黄金 / L4 白金（level 1-5）
 *
 * 说明：体现"等级越高权益越多"的产品设计，管理员可在后台
 *      「等级权限配置」覆盖（写入 member_module_permissions 后 DB 优先）。
 */
export const MODULE_DEFAULT_PERMISSIONS: Record<string, readonly boolean[]> = {
  // 基础功能：所有等级开放
  chat: [true, true, true, true, true],
  quote_generate: [true, true, true, true, true],
  history: [true, true, true, true, true],
  customer_manage: [true, true, true, true, true],
  // 编辑/预览：默认关闭（与迁移 073 种子一致）
  edit: [false, false, false, false, false],
  preview: [false, false, false, false, false],
  // 方案增强：免费用户不可用，会员及以上可用
  enhance_proposal: [false, true, true, true, true],
  // 资料下载：默认全开放（本身按 points_download_config 扣积分，等级维度可由后台收紧）
  knowledge_download: [true, true, true, true, true],
  // 数据导出：白银及以上可用
  data_export: [false, false, true, true, true],
  // 报表查看（#20260901-0900 P2-2）：默认全关（保持现状仅管理员可见，
  // 管理员角色在拦截网关直通；等级维度可由后台「等级权限配置」开放）
  report_view: [false, false, false, false, false],
};

/** 取某模块在某等级下的默认开关（与运行时拦截网关判定一致） */
export function getDefaultModulePermission(moduleKey: string, levelCode: string): boolean {
  const matrix = MODULE_DEFAULT_PERMISSIONS[moduleKey];
  if (!matrix) return true;
  const num = LEVEL_CODE_TO_NUM[levelCode] ?? 1;
  return matrix[num - 1] ?? true;
}

// L0-L4 与旧 level_definitions(1-5) 映射（阈值一致）
// #202608302400 阶段1：统一复用 level-constants 的映射，避免两处维护
export const LEVEL_CODE_TO_NUM: Record<string, number> = { ...LEVEL_CODE_TO_NUM_MAP };

// 等级徽章颜色（按序，L0-L4）
// #202608302600：派生自 level-constants.LEVEL_BADGE_CLASS（level 1-5），保持唯一来源
export const LEVEL_BADGE_CLASSES: Record<string, string> = LEVEL_METAS.reduce(
  (acc, m) => {
    acc[m.levelCode] = LEVEL_BADGE_CLASS[m.level];
    return acc;
  },
  {} as Record<string, string>
);
