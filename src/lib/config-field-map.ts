/**
 * 模块字段映射 - 数据库列名与前端字段名统一
 *
 * 数据库表 system_modules 实际列名与前端使用的字段名一致：
 *   module_code, module_name, is_active, path
 *
 * 映射函数保留为透传，以便后续如需分离字段名时修改。
 */

/** 透传：DB 列名即前端字段名，无需转换 */
export function mapModuleToFrontend(row: Record<string, any>): Record<string, any> {
  return row;
}

/** 透传：前端字段名即 DB 列名，无需转换 */
export function mapModuleToDb(body: Record<string, any>): Record<string, any> {
  return body;
}
