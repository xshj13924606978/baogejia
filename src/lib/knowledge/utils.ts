/**
 * 知识库通用工具函数
 */

/**
 * 获取用于展示的真实文件名。
 * - 优先使用 metadata.original_file_name
 * - 其次从 file_name 中去除时间戳前缀（如 1787475923954-filename.pdf → filename.pdf）
 */
export function getKnowledgeFileName(
  item: { file_name?: string; metadata?: Record<string, any> | null }
): string {
  const original = item.metadata?.original_file_name;
  if (typeof original === 'string' && original.trim()) {
    return original.trim();
  }
  const name = item.file_name || '';
  return name.replace(/^\d{13,}-/, '') || name;
}
