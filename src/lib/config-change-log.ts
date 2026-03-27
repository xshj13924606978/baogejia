/**
 * 配置变更日志工具
 * 在模块/页面/字段/按钮的增删改操作中记录变更历史
 */

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

type TargetType = 'module' | 'page' | 'field' | 'action' | 'user_override' | 'user_menu' | 'user_page' | 'user_field' | 'user_action';

interface LogEntry {
  adminId: string;
  targetType: TargetType;
  targetId: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  description?: string;
}

/**
 * 记录配置变更日志
 */
export async function logConfigChange(entry: LogEntry): Promise<void> {
  try {
    const db = getSupabaseServiceClient();
    await db.from('config_change_logs').insert({
      admin_id: entry.adminId,
      target_type: entry.targetType,
      target_id: entry.targetId,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
      change_description: entry.description || null,
    });
  } catch (error) {
    console.error('[ConfigLog] 写入变更日志失败:', error);
    // 日志写入失败不影响主业务流程
  }
}

/**
 * 从请求中获取管理员 ID（兼容多种来源）
 */
export function getAdminId(request: Request, user?: any): string {
  // 优先使用权限系统返回的 user.id
  if (user?.id) return user.id;
  // 降级：从 header 获取
  const headerId = request.headers.get('x-user-id');
  if (headerId) return headerId;
  // 兜底
  return 'unknown';
}
