import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 检查 SQL 是否是 DDL（数据定义语言）语句
 * DDL 语句包括：CREATE, ALTER, DROP, TRUNCATE, RENAME
 */
function isDDLStatement(sql: string): boolean {
  const ddlKeywords = [
    /^\s*CREATE\s/i,
    /^\s*ALTER\s/i,
    /^\s*DROP\s/i,
    /^\s*TRUNCATE\s/i,
    /^\s*RENAME\s/i,
  ];

  return ddlKeywords.some((regex) => regex.test(sql.trim()));
}

/**
 * 执行 SQL 语句
 * @param sql - SQL 语句
 * @param params - 参数数组
 * @returns 查询结果
 */
export async function exec_sql(sql: string, params: any[] = []): Promise<any[]> {
  try {
    const isDDL = isDDLStatement(sql);
    console.log('[exec_sql] 执行 SQL:', sql.substring(0, 100) + '...');
    console.log('[exec_sql] SQL 类型:', isDDL ? 'DDL（结构变更）' : 'DML（数据操作）');
    console.log('[exec_sql] 参数:', params);

    const supabase = getSupabaseClient();

    // 使用 Supabase 的 rpc 方法执行原始 SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: sql,
      params: params,
    });

    if (error) {
      console.error('[exec_sql] ❌ SQL 执行失败:', error);
      throw error;
    }

    console.log('[exec_sql] ✅ SQL 执行成功，返回', data?.length || 0, '行');

    // 如果是 DDL 语句（CREATE, ALTER, DROP 等），自动刷新 Supabase schema 缓存
    if (isDDL) {
      console.log('[exec_sql] 检测到 DDL 语句，自动刷新 schema 缓存...');
      try {
        const { error: refreshError } = await supabase.rpc('exec_sql', {
          sql: "NOTIFY pgrst, 'reload schema';",
          params: [],
        });
        if (refreshError) {
          console.warn('[exec_sql] ⚠️ Schema 缓存刷新失败（不影响功能）:', refreshError.message);
        } else {
          console.log('[exec_sql] ✅ Schema 缓存刷新成功');
        }
      } catch (refreshErr) {
        console.warn(
          '[exec_sql] ⚠️ Schema 缓存刷新异常（不影响功能）:',
          refreshErr instanceof Error ? refreshErr.message : refreshErr
        );
      }
    }

    return data || [];
  } catch (error: any) {
    console.error('[exec_sql] ❌ SQL 执行异常:', error.message);
    throw error;
  }
}
