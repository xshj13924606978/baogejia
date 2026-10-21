import { getSiteConfig } from '@/lib/site-config';
import { getServiceSupabase } from '@/lib/supabase-client';

const CONFIG_KEY = 'knowledge_import_config';

export interface ImportConfig {
  wechat_enabled?: boolean;
  wechat_secret?: string;
  wechat_auto_approve?: boolean;
  wechat_default_type?: string;
  wechat_whitelist_enabled?: boolean;
  email_enabled?: boolean;
  email_secret?: string;
  email_auto_approve?: boolean;
  email_default_type?: string;
  email_whitelist_enabled?: boolean;
}

const DEFAULT_CONFIG: ImportConfig = {
  wechat_enabled: false,
  wechat_secret: '',
  wechat_auto_approve: false,
  wechat_default_type: 'document',
  wechat_whitelist_enabled: false,
  email_enabled: false,
  email_secret: '',
  email_auto_approve: false,
  email_default_type: 'document',
  email_whitelist_enabled: false,
};

export async function getImportConfig(): Promise<ImportConfig> {
  const stored = await getSiteConfig<ImportConfig>(CONFIG_KEY, null);
  return { ...DEFAULT_CONFIG, ...(stored || {}) };
}

export interface WhitelistCheckPayload {
  sourceType: 'wechat' | 'email';
  sourceValue?: string | null;
}

/**
 * 校验导入来源白名单
 *
 * 当对应通道的白名单开关关闭、或白名单为空、或未提供 sourceValue 时直接放行。
 * 开启且传入 sourceValue 时，必须在白名单列表中存在且启用才放行。
 */
export async function checkImportWhitelist(payload: WhitelistCheckPayload): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const config = await getImportConfig();
  const enabledKey =
    payload.sourceType === 'wechat' ? 'wechat_whitelist_enabled' : 'email_whitelist_enabled';

  if (!config[enabledKey]) {
    return { allowed: true };
  }

  const sourceValue = (payload.sourceValue || '').trim();
  if (!sourceValue) {
    return { allowed: false, reason: '白名单已启用，但未提供来源标识' };
  }

  try {
    const supabase = await getServiceSupabase();
    const { data, error } = await supabase
      .from('knowledge_import_whitelist')
      .select('id')
      .eq('source_type', payload.sourceType)
      .eq('source_value', sourceValue)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return { allowed: false, reason: '来源不在白名单内' };
    }

    return { allowed: true };
  } catch (err) {
    console.error('[Import Guard] 白名单校验异常:', err);
    // 校验异常时保守拒绝，避免未授权导入
    return { allowed: false, reason: '白名单校验失败' };
  }
}
