import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 审计日志服务
 * 用于记录权限相关操作的审计日志
 */
export class AuditLogService {
  /**
   * 记录审计日志
   *
   * @param params 审计日志参数
   * @returns Promise<boolean> 是否记录成功
   */
  static async log(params: {
    userId: number;
    username?: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'GRANT' | 'REVOKE' | 'VIEW';
    resourceType: string;
    resourceId?: string | number | null;
    oldValue?: unknown;
    newValue?: unknown;
    changes?: Record<string, { old: unknown; new: unknown }>;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
    status?: 'success' | 'failure';
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();

      const logData = {
        user_id: params.userId,
        username: params.username,
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId?.toString(),
        old_value: params.oldValue as Record<string, unknown>,
        new_value: params.newValue as Record<string, unknown>,
        changes: params.changes as Record<string, unknown>,
        reason: params.reason,
        ip_address: params.ipAddress,
        user_agent: params.userAgent,
        status: params.status || 'success',
        error_message: params.errorMessage,
        metadata: params.metadata as Record<string, unknown>,
      };

      const { error } = await supabase
        .from('permission_audit_logs')
        .insert(logData);

      if (error) {
        console.error('[AuditLog] 记录审计日志失败:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[AuditLog] 记录审计日志异常:', error);
      return false;
    }
  }

  /**
   * 查询审计日志
   *
   * @param params 查询参数
   * @returns Promise<Array> 审计日志列表
   */
  static async query(params: {
    userId?: number;
    action?: string;
    resourceType?: string;
    resourceId?: string | number;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<Array<unknown>> {
    try {
      const supabase = getSupabaseClient();

      let query = supabase
        .from('permission_audit_logs')
        .select('*')
        .order('created_at', { ascending: false });

      // 应用过滤条件
      if (params.userId) {
        query = query.eq('user_id', params.userId);
      }
      if (params.action) {
        query = query.eq('action', params.action);
      }
      if (params.resourceType) {
        query = query.eq('resource_type', params.resourceType);
      }
      if (params.resourceId) {
        query = query.eq('resource_id', params.resourceId.toString());
      }
      if (params.status) {
        query = query.eq('status', params.status);
      }
      if (params.startDate) {
        query = query.gte('created_at', params.startDate.toISOString());
      }
      if (params.endDate) {
        query = query.lte('created_at', params.endDate.toISOString());
      }

      // 应用分页
      const limit = params.limit || 100;
      const offset = params.offset || 0;
      query = query.range(offset, offset + limit - 1);

      const { data, error } = await query;

      if (error) {
        console.error('[AuditLog] 查询审计日志失败:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[AuditLog] 查询审计日志异常:', error);
      return [];
    }
  }

  /**
   * 获取资源变更历史
   *
   * @param resourceType 资源类型
   * @param resourceId 资源ID
   * @returns Promise<Array> 变更历史列表
   */
  static async getResourceHistory(
    resourceType: string,
    resourceId: string | number
  ): Promise<Array<unknown>> {
    try {
      const supabase = getSupabaseClient();

      const { data, error } = await supabase
        .from('permission_audit_logs')
        .select('*')
        .eq('resource_type', resourceType)
        .eq('resource_id', resourceId.toString())
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('[AuditLog] 获取资源历史失败:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[AuditLog] 获取资源历史异常:', error);
      return [];
    }
  }

  /**
   * 统计用户操作频率
   *
   * @param userId 用户ID
   * @param days 统计天数
   * @returns Promise<Record<string, number>> 操作统计
   */
  static async getUserActionStats(
    userId: number,
    days: number = 30
  ): Promise<Record<string, number>> {
    try {
      const supabase = getSupabaseClient();

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);

      const { data, error } = await supabase
        .from('permission_audit_logs')
        .select('action, status')
        .eq('user_id', userId)
        .gte('created_at', startDate.toISOString());

      if (error) {
        console.error('[AuditLog] 统计用户操作失败:', error);
        return {};
      }

      const stats: Record<string, number> = {};
      const actions = data || [];

      // 统计总操作数
      stats.total = actions.length;

      // 按操作类型统计
      actions.forEach((log: any) => {
        const key = log.action.toLowerCase();
        stats[key] = (stats[key] || 0) + 1;
      });

      // 统计成功/失败数
      stats.success = actions.filter((log: any) => log.status === 'success').length;
      stats.failure = actions.filter((log: any) => log.status === 'failure').length;

      return stats;
    } catch (error) {
      console.error('[AuditLog] 统计用户操作异常:', error);
      return {};
    }
  }

  /**
   * 检测异常操作模式
   *
   * @param userId 用户ID
   * @param threshold 阈值（默认：10次/分钟）
   * @returns Promise<boolean> 是否检测到异常
   */
  static async detectAnomaly(
    userId: number,
    threshold: number = 10
  ): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();

      const oneMinuteAgo = new Date();
      oneMinuteAgo.setMinutes(oneMinuteAgo.getMinutes() - 1);

      const { count, error } = await supabase
        .from('permission_audit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', oneMinuteAgo.toISOString());

      if (error) {
        console.error('[AuditLog] 检测异常操作失败:', error);
        return false;
      }

      const operationCount = count || 0;
      const isAnomaly = operationCount > threshold;

      if (isAnomaly) {
        console.warn(`[AuditLog] 检测到异常操作：用户 ${userId} 在1分钟内执行了 ${operationCount} 次操作`);
      }

      return isAnomaly;
    } catch (error) {
      console.error('[AuditLog] 检测异常操作异常:', error);
      return false;
    }
  }
}

/**
 * 审计日志中间件辅助函数
 * 用于在API路由中快速记录审计日志
 */
export async function auditLog(
  request: Request,
  params: {
    userId: number;
    username?: string;
    action: 'CREATE' | 'UPDATE' | 'DELETE' | 'GRANT' | 'REVOKE' | 'VIEW';
    resourceType: string;
    resourceId?: string | number | null;
    oldValue?: unknown;
    newValue?: unknown;
    changes?: Record<string, { old: unknown; new: unknown }>;
    reason?: string;
    status?: 'success' | 'failure';
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  // 从请求中提取IP和User-Agent
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
  const userAgent = request.headers.get('user-agent') || 'unknown';

  return AuditLogService.log({
    ...params,
    ipAddress,
    userAgent,
  });
}
