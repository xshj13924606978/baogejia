import { getServiceSupabase } from '@/lib/supabase-client';

/**
 * 读取站点配置（自动 JSON 解析）
 *
 * 若存储值是可解析的 JSON，返回解析后的对象/数组/数字；
 * 否则原样返回字符串。用于知识库导入配置等结构化配置。
 *
 * @param key 配置键（对应 config_key）
 * @param defaultValue 默认值
 */
export async function getSiteConfig<T = any>(
  key: string,
  defaultValue: T | null = null
): Promise<T | null> {
  const raw = await getSiteConfigValue(key, null);
  if (raw === null || raw === undefined || raw === '') return defaultValue;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
  }
}

/**
 * 写入站点配置（值可为任意 JSON 可序列化对象）
 *
 * 使用 upsert 幂等写入；若传入对象则自动 JSON 序列化。
 *
 * @param key 配置键（对应 config_key）
 * @param value 配置值
 * @param description 配置描述
 */
export async function setSiteConfig(
  key: string,
  value: any,
  description?: string
): Promise<void> {
  const db = getServiceSupabase();
  const rawValue = typeof value === 'string' ? value : JSON.stringify(value);

  const { error } = await db.from('site_config').upsert(
    {
      config_key: key,
      config_value: rawValue,
      description: description || null,
      config_type: 'json',
      category: 'knowledge',
      label: key,
      is_public: false,
    },
    { onConflict: 'config_key' }
  );

  if (error) throw error;
}

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
