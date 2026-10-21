import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { getSiteConfig, setSiteConfig } from '@/lib/site-config';

/**
 * 导入配置管理 API
 *
 * GET: 读取当前导入配置 + 动态资料类型定义
 * PUT: 更新导入配置（持久化到 site_config 表）
 *
 * 配置以 JSON 存储在 site_config.config_value，
 * config_key = 'knowledge_import_config'
 */

const CONFIG_KEY = 'knowledge_import_config';
const TYPES_KEY = 'knowledge_import_types';

interface ImportConfig {
  wechat_enabled: boolean;
  wechat_secret: string;
  wechat_auto_approve: boolean;
  wechat_default_type: string;
  wechat_whitelist_enabled: boolean;
  email_enabled: boolean;
  email_secret: string;
  email_auto_approve: boolean;
  email_default_type: string;
  email_whitelist_enabled: boolean;
}

interface ImportType {
  type: string;
  label: string;
  description?: string;
  icon?: string;
}

// 默认配置（数据库未初始化时兜底，不影响已保存配置）
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

// 默认类型定义（数据库未初始化时兜底，保证页面始终可用）
const DEFAULT_TYPES: ImportType[] = [
  { type: 'document', label: '技术文档', description: '产品说明书、操作手册、维护指南等技术资料', icon: 'FileText' },
  { type: 'case', label: '案例', description: '工程案例、项目案例', icon: 'Briefcase' },
  { type: 'standard', label: '标准规范', description: '国标、行标、地标、企标等规范文件', icon: 'Scale' },
  { type: 'drawing', label: '图纸图片', description: 'CAD、工艺流程图、布置图、安装图等', icon: 'Image' },
  { type: 'quota', label: '定额', description: '全国、地方、行业、企业定额', icon: 'Calculator' },
];

function asBoolean(value: unknown): boolean {
  return Boolean(value);
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const stored = await getSiteConfig<Partial<ImportConfig>>(CONFIG_KEY, null);
    const types = await getSiteConfig<ImportType[]>(TYPES_KEY, DEFAULT_TYPES);

    return NextResponse.json({
      success: true,
      data: { ...DEFAULT_CONFIG, ...(stored || {}) },
      types: types || DEFAULT_TYPES,
    });
  } catch (error) {
    console.error('[Import Config] 读取失败:', error);
    return NextResponse.json({ success: false, error: '读取配置失败' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = (await request.json()) as Partial<ImportConfig>;
    const stored = await getSiteConfig<Partial<ImportConfig>>(CONFIG_KEY, null);

    const merged: ImportConfig = {
      ...DEFAULT_CONFIG,
      ...(stored || {}),
      ...(body || {}),
    };

    // 清理/校验配置值
    merged.wechat_enabled = asBoolean(merged.wechat_enabled);
    merged.wechat_auto_approve = asBoolean(merged.wechat_auto_approve);
    merged.wechat_whitelist_enabled = asBoolean(merged.wechat_whitelist_enabled);
    merged.email_enabled = asBoolean(merged.email_enabled);
    merged.email_auto_approve = asBoolean(merged.email_auto_approve);
    merged.email_whitelist_enabled = asBoolean(merged.email_whitelist_enabled);
    merged.wechat_secret = asString(merged.wechat_secret);
    merged.email_secret = asString(merged.email_secret);

    // 动态类型校验（避免前端硬编码失效或篡改）
    const types = await getSiteConfig<ImportType[]>(TYPES_KEY, DEFAULT_TYPES);
    const validTypes = (types || DEFAULT_TYPES).map((t) => t.type);
    if (!validTypes.includes(merged.wechat_default_type)) {
      merged.wechat_default_type = validTypes[0] || 'document';
    }
    if (!validTypes.includes(merged.email_default_type)) {
      merged.email_default_type = validTypes[0] || 'document';
    }

    // 持久化到 site_config
    await setSiteConfig(CONFIG_KEY, merged, '知识库导入配置（微信/邮件）');

    return NextResponse.json({
      success: true,
      data: merged,
      types: types || DEFAULT_TYPES,
      message: '配置已保存',
    });
  } catch (error) {
    console.error('[Import Config] 保存失败:', error);
    return NextResponse.json({ success: false, error: '保存配置失败' }, { status: 500 });
  }
}
