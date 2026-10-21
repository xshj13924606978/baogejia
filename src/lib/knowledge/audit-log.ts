import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 知识库条目操作审计日志
 *
 * 日志以 JSONB 数组形式存储在 knowledge_entries.audit_logs 字段中，
 * 通过 RPC knowledge_append_audit_log 追加写入（避免读改写竞态）。
 *
 * 迁移脚本：database/migrations/065_knowledge_audit_logs.sql
 */

export type AuditLogAction =
  | 'create'
  | 'edit'
  | 'approve'
  | 'reject'
  | 'delete'
  | 'batch_approve'
  | 'batch_reject'
  | 'batch_reset';

export interface AuditLogEntry {
  id: string;
  action: AuditLogAction;
  operator_id: string;
  operator_name: string | null;
  timestamp: string;
  details: Record<string, any> | null;
  reason: string | null;
}

/** 生成简短唯一 ID（时间戳 + 随机段） */
function generateId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * 追加一条审计日志到知识条目
 *
 * 非阻塞使用方建议 try/catch 包裹；写入失败不应影响主流程。
 */
export async function addAuditLog(
  entryId: string,
  action: AuditLogAction,
  operatorId: string,
  details?: Record<string, any>,
  reason?: string,
  operatorName?: string | null
): Promise<void> {
  const db = getSupabaseServiceClient();
  const logEntry: AuditLogEntry = {
    id: generateId(),
    action,
    operator_id: operatorId,
    operator_name: operatorName || null,
    timestamp: new Date().toISOString(),
    details: details || null,
    reason: reason || null,
  };

  const { error } = await db.rpc('knowledge_append_audit_log', {
    p_entry_id: entryId,
    p_log: JSON.stringify(logEntry),
  });

  if (error) {
    // 兼容 RPC 未部署的情况：降级为读改写（存在竞态但功能可用）
    console.warn('[AuditLog] RPC 写入失败，降级读改写:', error.message);
    const { data: row } = await db
      .from('knowledge_entries')
      .select('audit_logs')
      .eq('id', entryId)
      .single();

    if (row) {
      const logs = Array.isArray(row.audit_logs) ? row.audit_logs : [];
      await db
        .from('knowledge_entries')
        .update({ audit_logs: [...logs, logEntry] })
        .eq('id', entryId);
    }
  }
}
