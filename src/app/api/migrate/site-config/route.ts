export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { Pool } from 'pg';

/**
 * 迁移：创建 site_config 表并初始化默认配置
 * POST /api/migrate/site-config
 *
 * 使用 pg Pool 直接操作 PostgreSQL，从 Supabase 项目 URL + service_role key
 * 构造连接串（生产环境没有 DATABASE_URL 变量）。
 */
export async function POST() {
  // 用 Supabase 项目凭证构造 pg Pool（不依赖 DATABASE_URL）
  const supabaseUrl = process.env.COZE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({
      success: false,
      error: '缺少 Supabase 连接配置 (SUPABASE_URL 或 SERVICE_ROLE_KEY)',
    }, { status: 500 });
  }

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];

  // 优先用 DATABASE_URL（如果有），否则用 Supabase Pooler
  // 注意：db.xxx.supabase.co 只有 IPv6，国内服务器可能无 IPv6 导致连接失败，
  // 使用区域 pooler（IPv4 可达）绕过此问题
  let pool: Pool;
  if (process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  } else {
    pool = new Pool({
      host: `aws-0-ap-southeast-1.pooler.supabase.com`,
      port: 6543,
      database: 'postgres',
      user: `postgres.${projectRef}`,
      password: serviceKey,
      ssl: { rejectUnauthorized: false },
    });
  }

  try {
    // 建表
    await pool.query(`
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
      )
    `);

    await pool.query('CREATE INDEX IF NOT EXISTS idx_site_config_category ON site_config(category)').catch(() => {});
    await pool.query('CREATE INDEX IF NOT EXISTS idx_site_config_key ON site_config(config_key)').catch(() => {});

    // 3. 默认配置
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
    { config_key: 'daily_login_points', config_value: '10', config_type: 'number', category: 'points', label: '每日登录积分', description: '用户每日首次登录获得的积分数' },
    { config_key: 'invite_reward_points', config_value: '50', config_type: 'number', category: 'points', label: '邀请奖励积分', description: '成功邀请新用户获得的积分数' },
    { config_key: 'upload_file_points', config_value: '5', config_type: 'number', category: 'points', label: '上传文件积分', description: '用户上传文件奖励的积分数' },
    { config_key: 'parse_document_points', config_value: '20', config_type: 'number', category: 'points', label: '解析文档积分', description: '使用 AI 解析需求文档消耗的积分数' },
    { config_key: 'generate_proposal_points', config_value: '30', config_type: 'number', category: 'points', label: '生成方案积分', description: '使用 AI 生成报价方案消耗的积分数' },
    { config_key: 'enhance_proposal_points', config_value: '15', config_type: 'number', category: 'points', label: '优化方案积分', description: '使用 AI 优化/润色方案消耗的积分数' },
    { config_key: 'export_quote_points', config_value: '5', config_type: 'number', category: 'points', label: '导出报价积分', description: '导出报价单消耗的积分数' },
    { config_key: 'task_reward_points', config_value: '100', config_type: 'number', category: 'points', label: '完成任务积分', description: '完成系统任务/活动奖励的积分数' },
    { config_key: 'chat_points_per_token', config_value: '0.001', config_type: 'number', category: 'points', label: 'AI 对话积分系数', description: '每 Token AI 对话消耗的积分' },
    { config_key: 'max_points_per_day', config_value: '1000', config_type: 'number', category: 'points', label: '每日获取上限', description: '用户每日获取积分上限' },
    // 安全设置
    { config_key: 'login_max_attempts', config_value: '5', config_type: 'number', category: 'security', label: '登录最大尝试次数', description: '锁定前允许的最大登录失败次数' },
    { config_key: 'login_lockout_minutes', config_value: '30', config_type: 'number', category: 'security', label: '锁定时长(分钟)', description: '登录失败过多后的锁定时间' },
    { config_key: 'password_min_length', config_value: '8', config_type: 'number', category: 'security', label: '密码最小长度', description: '用户密码最小字符数' },
    { config_key: 'allow_register', config_value: 'true', config_type: 'boolean', category: 'security', label: '开放注册', description: '是否允许新用户注册', is_public: true },
    { config_key: 'require_email_verify', config_value: 'false', config_type: 'boolean', category: 'security', label: '邮箱验证', description: '注册后是否需要验证邮箱' },
    { config_key: 'session_timeout_hours', config_value: '24', config_type: 'number', category: 'security', label: '会话超时时间(小时)', description: '用户登录会话过期时间' },
    // 存储设置
    { config_key: 'max_upload_size_mb', config_value: '50', config_type: 'number', category: 'storage', label: '上传大小限制(MB)', description: '单文件最大上传大小' },
    { config_key: 'allowed_file_types', config_value: 'pdf,xlsx,xls,csv,doc,docx,jpg,png', config_type: 'string', category: 'storage', label: '允许的文件类型', description: '逗号分隔的文件扩展名' },
    { config_key: 'default_storage_mb', config_value: '100', config_type: 'number', category: 'storage', label: '默认存储空间(MB)', description: '新用户默认存储空间' },
    { config_key: 'max_product_images', config_value: '10', config_type: 'number', category: 'storage', label: '产品最大图片数', description: '每个产品最多上传的图片数量' },
    { config_key: 'max_quote_attachments', config_value: '5', config_type: 'number', category: 'storage', label: '报价最大附件数', description: '每个报价单最多上传的附件数量' },
  ];

    // 4. 批量插入（ON CONFLICT 跳过已存在的）
    const placeholders = defaults.map((_, i) => {
      const base = i * 7;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7})`;
    }).join(', ');

    const params: any[] = [];
    for (const item of defaults) {
      params.push(
        item.config_key,
        item.config_value,
        item.config_type,
        item.category,
        item.label,
        item.description,
        item.is_public === true,
      );
    }

    const result = await pool.query(
      `INSERT INTO site_config (config_key, config_value, config_type, category, label, description, is_public)
       VALUES ${placeholders}
       ON CONFLICT (config_key) DO NOTHING
       RETURNING config_key`,
      params,
    );

    const inserted = result.rowCount || 0;
    const skipped = defaults.length - inserted;

    return NextResponse.json({
      success: true,
      message: `迁移完成：${inserted} 项新增，${skipped} 项已存在跳过`,
    });
  } catch (error: any) {
    console.error('[Migrate site-config] 异常:', error.message);
    return NextResponse.json({
      success: false,
      error: '迁移失败: ' + error.message,
    }, { status: 500 });
  } finally {
    await pool.end().catch(() => {});
  }
}
