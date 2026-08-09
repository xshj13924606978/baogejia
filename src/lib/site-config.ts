import { getServiceSupabase } from '@/lib/supabase-client';

/**
 * 读取单个站点配置值
 * @param key 配置键
 * @param defaultValue 默认值
 * @returns 配置值，不存在则返回默认值
 */
export async function getSiteConfigValue(
  key: string,
  defaultValue: string | null = null
): Promise<string | null> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from('site_config')
    .select('config_value')
    .eq('config_key', key)
    .single();

  if (error || !data) {
    return defaultValue;
  }

  return data.config_value ?? defaultValue;
}

/**
 * 批量读取站点配置值
 * @param keys 配置键数组
 * @returns 键值对对象，不存在的键值为 null
 */
export async function getSiteConfigValues(
  keys: string[]
): Promise<Record<string, string | null>> {
  const db = getServiceSupabase();
  const { data, error } = await db
    .from('site_config')
    .select('config_key, config_value')
    .in('config_key', keys);

  const result: Record<string, string | null> = {};
  keys.forEach((k) => {
    result[k] = null;
  });

  if (error || !data) {
    return result;
  }

  data.forEach((item: { config_key: string; config_value: string | null }) => {
    result[item.config_key] = item.config_value;
  });

  return result;
}
