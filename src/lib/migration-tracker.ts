/**
 * 迁移执行台账服务
 * 对话窗: #[20260901-0900] P3-2
 *
 * 数据表：migration_records（迁移 125 创建）。
 * 用途：
 *   1. 记录每次迁移的执行时间 / 状态 / 执行来源 / 校验和，执行状态可追溯；
 *   2. 供运维脚本与后续管理界面查询「某迁移是否已应用」。
 * 写入只能由统一 Migration Runner 在 migration 事务内完成。
 * 此模块保留只读查询兼容；旧写入 API 固定 fail-closed。
 */

import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export interface MigrationRecordInput {
  migrationKey: string;
  fileName?: string;
  description?: string;
  status?: 'success' | 'failed';
  executor?: string;
  checksum?: string;
  durationMs?: number;
  errorMessage?: string;
}

export interface MigrationRecord {
  id: string;
  migration_key: string;
  file_name: string | null;
  description: string | null;
  status: string;
  executor: string | null;
  checksum: string | null;
  duration_ms: number | null;
  error_message: string | null;
  executed_at: string;
}

function isTableMissing(error: any): boolean {
  return (
    error?.code === '42P01' ||
    error?.message?.includes('migration_records') ||
    error?.message?.includes('does not exist')
  );
}

/**
 * @deprecated 应用进程不得登记 migration。统一 Runner 会把 SQL 与登记放在同一事务。
 */
export async function recordMigration(_input: MigrationRecordInput): Promise<boolean> {
  console.warn('[MigrationTracker] 写入入口已禁用；请使用统一 Migration Runner');
  return false;
}

/**
 * 查询迁移台账（按执行时间倒序）
 */
export async function listMigrationRecords(limit = 50): Promise<MigrationRecord[]> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('migration_records')
      .select('*')
      .order('executed_at', { ascending: false })
      .limit(limit);

    if (error) {
      if (!isTableMissing(error)) {
        console.warn('[MigrationTracker] 查询台账失败:', error.message);
      }
      return [];
    }
    return (data || []) as MigrationRecord[];
  } catch {
    return [];
  }
}

/**
 * 查询单个迁移的执行状态（用于「迁移是否已应用」判定）
 */
export async function getMigrationRecord(migrationKey: string): Promise<MigrationRecord | null> {
  try {
    const supabase = getSupabaseServiceClient();
    const { data, error } = await supabase
      .from('migration_records')
      .select('*')
      .eq('migration_key', migrationKey)
      .maybeSingle();

    if (error) {
      if (!isTableMissing(error)) {
        console.warn('[MigrationTracker] 查询迁移状态失败:', error.message);
      }
      return null;
    }
    return (data as MigrationRecord) || null;
  } catch {
    return null;
  }
}
