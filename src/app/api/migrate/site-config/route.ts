export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 迁移：创建 site_config 表并初始化默认配置
 * POST /api/migrate/site-config
 */
export async function POST() {
  try {
    const db = getSupabaseServiceClient();

    // 创建表
    const { error: createError } = await db.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS site_config (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          config_key VARCHAR(100) UNIQUE NOT NULL,
          config_value TEXT,
          config_type VARCHAR(20) DEFAULT 'string',
          category VARCHAR(50) DEFAULT 'general',
          label VARCHAR(100),
          description TEXT,
          is_public BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- 索引
        CREATE INDEX IF NOT EXISTS idx_site_config_category ON site_config(category);
        CREATE INDEX IF NOT EXISTS idx_site_config_key ON site_config(config_key);

        -- RLS（关闭，由应用层控制权限）
        ALTER TABLE site_config ENABLE ROW LEVEL SECURITY;

        -- 允许匿名读取公开配置
        CREATE POLICY "Public read public config" ON site_config
          FOR SELECT USING (is_public = true);

        -- 允许认证用户读取所有配置
        CREATE POLICY "Authenticated read all config" ON site_config
          FOR SELECT USING (auth.role() = 'authenticated');
      `
    });

    if (createError) {
      // 尝试直接用 DDL（rpc 不可用时）
    }

    // 插入默认配置
    const defaults = [
      // 基本设置
      { config_key: 'site_name', config_value: '智能报价系统', config_type: 'string', category: 'general', label: '站点名称', description: '系统显示名称，用于后台、前台及导出文档', is_public: true },
      { config_key: 'site_short_name', config_value: '报个价', config_type: 'string', category: 'general', label: '站点简称', description: '前台 Logo 等位置使用的简称', is_public: true },
      { config_key: 'site_description', config_value: '专业的在线报价管理平台', config_type: 'string', category: 'general', label: '站点描述', description: '系统 Slogan 与 SEO 描述', is_public: true },
      { config_key: 'site_logo', config_value: '', config_type: 'string', category: 'general', label: '站点 Logo URL', description: '前台/后台 Logo 图片地址，为空时使用文字 Logo', is_public: true },
      { config_key: 'site_favicon', config_value: '/favicon.ico', config_type: 'string', category: 'general', label: '站点 Favicon', description: '浏览器标签页图标地址', is_public: true },
      { config_key: 'site_theme_color', config_value: '#0a4a7a', config_type: 'string', category: 'general', label: '主题色', description: '系统主色调，用于前台与后台品牌展示', is_public: true },
      { config_key: 'site_icp', config_value: '', config_type: 'string', category: 'general', label: '备案号', description: 'ICP 备案号，显示在页面底部', is_public: true },
      { config_key: 'site_copyright', config_value: '© 2026 智能报价系统 版权所有', config_type: 'string', category: 'general', label: '版权信息', description: '页面底部版权文案', is_public: true },
      { config_key: 'contact_email', config_value: '', config_type: 'string', category: 'general', label: '联系邮箱', description: '管理员/客服联系邮箱' },
      { config_key: 'contact_phone', config_value: '', config_type: 'string', category: 'general', label: '联系电话', description: '客服联系电话' },
      { config_key: 'contact_address', config_value: '', config_type: 'string', category: 'general', label: '公司地址', description: '企业办公地址' },
      { config_key: 'service_hours', config_value: '工作日 9:00-18:00', config_type: 'string', category: 'general', label: '客服工作时间', description: '客服在线服务时间说明' },
      { config_key: 'default_company_name', config_value: '', config_type: 'string', category: 'general', label: '默认供应商/公司名', description: '报价单中默认显示的公司名称' },
      { config_key: 'default_quote_currency', config_value: 'CNY', config_type: 'string', category: 'general', label: '默认报价币种', description: '报价单默认币种，如 CNY/USD' },
      { config_key: 'default_quote_valid_days', config_value: '15', config_type: 'number', category: 'general', label: '报价单默认有效期(天)', description: '新建报价单时的默认有效天数' },
      { config_key: 'default_tax_rate', config_value: '13', config_type: 'number', category: 'general', label: '默认税率(%)', description: '新建报价单时的默认税率' },
      // 积分设置
      { config_key: 'register_points', config_value: '100', config_type: 'number', category: 'points', label: '注册赠送积分', description: '新用户注册赠送的积分数' },
      { config_key: 'daily_sign_points', config_value: '10', config_type: 'number', category: 'points', label: '每日签到积分', description: '每日签到获得的积分数' },
      { config_key: 'invite_points', config_value: '50', config_type: 'number', category: 'points', label: '邀请奖励积分', description: '成功邀请新用户获得的积分数' },
      { config_key: 'max_points_per_day', config_value: '1000', config_type: 'number', category: 'points', label: '每日获取上限', description: '用户每日获取积分上限' },
      // 安全设置
      { config_key: 'login_max_attempts', config_value: '5', config_type: 'number', category: 'security', label: '登录最大尝试次数', description: '锁定前允许的最大登录失败次数' },
      { config_key: 'login_lockout_minutes', config_value: '30', config_type: 'number', category: 'security', label: '锁定时长(分钟)', description: '登录失败过多后的锁定时间' },
      { config_key: 'password_min_length', config_value: '8', config_type: 'number', category: 'security', label: '密码最小长度', description: '用户密码最小字符数' },
      { config_key: 'allow_register', config_value: 'true', config_type: 'boolean', category: 'security', label: '开放注册', description: '是否允许新用户注册', is_public: true },
      { config_key: 'require_email_verify', config_value: 'false', config_type: 'boolean', category: 'security', label: '邮箱验证', description: '注册后是否需要验证邮箱' },
      // 存储设置
      { config_key: 'max_upload_size_mb', config_value: '50', config_type: 'number', category: 'storage', label: '上传大小限制(MB)', description: '单文件最大上传大小' },
      { config_key: 'allowed_file_types', config_value: 'pdf,xlsx,xls,csv,doc,docx,jpg,png', config_type: 'string', category: 'storage', label: '允许的文件类型', description: '逗号分隔的文件扩展名' },
      { config_key: 'default_storage_mb', config_value: '100', config_type: 'number', category: 'storage', label: '默认存储空间(MB)', description: '新用户默认存储空间' },
    ];

    let inserted = 0;
    for (const item of defaults) {
      const { error } = await db.from('site_config').upsert(item, { onConflict: 'config_key' });
      if (!error) inserted++;
    }

    return NextResponse.json({
      success: true,
      message: `迁移完成：${inserted}/${defaults.length} 项默认配置已写入`,
    });
  } catch (error: any) {
    console.error('[Migrate site-config] 异常:', error);
    return NextResponse.json({ success: false, error: '迁移失败: ' + error.message }, { status: 500 });
  }
}
