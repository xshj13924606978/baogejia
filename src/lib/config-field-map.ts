/**
 * 配置字段映射 - 数据库列名与前端字段名统一
 *
 * 数据库表 system_modules 实际列名（017 迁移 v2.0）：
 *   id, module_key, name_zh, name_en, icon, sort_order,
 *   parent_module_id, is_enabled, is_visible_in_menu, route_path,
 *   config, group_label, description, permission_code,
 *   created_at, updated_at
 *
 * 数据库表 system_pages 实际列名：
 *   id, module_id, page_key, name_zh, route_path,
 *   layout_template, is_enabled, config, sort_order,
 *   created_at, updated_at
 *
 * 前端字段名与数据库列名完全一致，映射函数为透传。
 */

/** 透传：DB 列名即前端字段名，无需转换 */
export function mapModuleToFrontend(row: Record<string, any>): Record<string, any> {
  return row;
}

/** 透传：前端字段名即 DB 列名，无需转换 */
export function mapModuleToDb(body: Record<string, any>): Record<string, any> {
  return body;
}
