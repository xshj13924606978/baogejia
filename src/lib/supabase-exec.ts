import { getSupabaseClient } from '@/lib/supabase-client';

export async function exec_sql(sql: string, params: any[] = []): Promise<any[]> {
  try {
    console.log('[exec_sql] 执行 SQL:', sql.substring(0, 100) + '...');
    console.log('[exec_sql] 参数:', params);
    
    const supabase = getSupabaseClient();
    
    // 使用 Supabase 的 rpc 方法执行原始 SQL
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: sql,
      params: params
    });
    
    if (error) {
      console.error('[exec_sql] ❌ SQL 执行失败:', error);
      throw error;
    }
    
    console.log('[exec_sql] ✅ SQL 执行成功，返回', data?.length || 0, '行');
    return data || [];
    
  } catch (error: any) {
    console.error('[exec_sql] ❌ SQL 执行异常:', error.message);
    throw error;
  }
}
