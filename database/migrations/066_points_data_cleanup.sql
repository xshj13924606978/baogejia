-- ============================================================
-- 迁移脚本: 第三批 P2/P3 清理 - 积分数据一致性
-- 版本: 066
-- 说明:
--   1. 修复 point_records 表结构 schema 漂移
--      （039/040 的简化版缺 balance_after / reference_id 列）
--   2. site_config 表在迁移中自动创建（不再依赖手动初始化）
--   3. 统一规则数值到 site_config 一份配置源
--      register=100 / daily_login=10 / invite_reward=50 / upload_file=5
--      并同步 points_rules 表数值
-- 执行方式: 在 Supabase SQL Editor 中执行
-- ============================================================

BEGIN;

-- ============================================================
-- 1. point_records 补齐缺失列（幂等，已存在则跳过）
-- ============================================================
ALTER TABLE public.point_records
  ADD COLUMN IF NOT EXISTS balance_after INTEGER DEFAULT 0;

ALTER TABLE public.point_records
  ADD COLUMN IF NOT EXISTS reference_id VARCHAR(160);

-- 补齐索引（幂等）。
-- 说明：幂等保护由 044 迁移中的 add/deduct_points_atomic 函数完成
-- （写入前按 user_id + reference_id 查重），此处仅建普通索引加速查询，
-- 避免历史数据存在同 user_id+reference_id 重复时唯一索引创建失败。
CREATE INDEX IF NOT EXISTS idx_point_records_reference_id
  ON public.point_records(reference_id);

CREATE INDEX IF NOT EXISTS idx_point_records_user_ref
  ON public.point_records(user_id, reference_id);

-- ============================================================
-- 2. site_config 表自动创建（幂等）
-- ============================================================
CREATE TABLE IF NOT EXISTS public.site_config (
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

CREATE INDEX IF NOT EXISTS idx_site_config_category ON public.site_config(category);
CREATE INDEX IF NOT EXISTS idx_site_config_key ON public.site_config(config_key);

-- ============================================================
-- 3. 初始化 site_config 默认配置（幂等，已存在不覆盖）
--    积分规则数值为唯一权威配置源
-- ============================================================
INSERT INTO site_config (config_key, config_value, config_type, category, label, description, is_public) VALUES
  -- ===== 通用站点配置 =====
  ('site_name', '智能报价系统', 'string', 'general', '站点名称', '系统显示名称，用于后台、前台及导出文档', true),
  ('site_short_name', '报个价', 'string', 'general', '站点简称', '前台 Logo 等位置使用的简称', true),
  ('site_description', '专业的在线报价管理平台', 'string', 'general', '站点描述', '系统 Slogan 与 SEO 描述', true),
  ('site_logo', '', 'string', 'general', '站点 Logo URL', '前台/后台 Logo 图片地址，为空时使用文字 Logo', true),
  ('site_favicon', '/favicon.ico', 'string', 'general', '站点 Favicon', '浏览器标签页图标地址', true),
  ('site_theme_color', '#0a4a7a', 'string', 'general', '主题色', '系统主色调，用于前台与后台品牌展示', true),
  ('site_icp', '', 'string', 'general', '备案号', 'ICP 备案号，显示在页面底部', true),
  ('site_copyright', '© 2026 智能报价系统 版权所有', 'string', 'general', '版权信息', '页面底部版权文案', true),
  ('contact_email', '', 'string', 'general', '联系邮箱', '管理员/客服联系邮箱', false),
  ('contact_phone', '', 'string', 'general', '联系电话', '客服联系电话', false),
  ('contact_address', '', 'string', 'general', '公司地址', '企业办公地址', false),
  ('service_hours', '工作日 9:00-18:00', 'string', 'general', '客服工作时间', '客服在线服务时间说明', false),
  ('default_company_name', '', 'string', 'general', '默认供应商/公司名', '报价单中默认显示的公司名称', false),
  ('default_quote_currency', 'CNY', 'string', 'general', '默认报价币种', '报价单默认币种，如 CNY/USD', false),
  ('default_quote_valid_days', '15', 'number', 'general', '报价单默认有效期(天)', '新建报价单时的默认有效天数', false),
  ('default_tax_rate', '13', 'number', 'general', '默认税率(%)', '新建报价单时的默认税率', false),

  -- ===== 积分规则（唯一权威配置源）=====
  ('register_points', '100', 'number', 'points', '注册赠送积分', '新用户注册赠送的积分数', false),
  ('daily_login_points', '10', 'number', 'points', '每日登录积分', '用户每日首次登录获得的积分数', false),
  ('invite_reward_points', '50', 'number', 'points', '邀请奖励积分', '成功邀请新用户获得的积分数', false),
  ('upload_file_points', '5', 'number', 'points', '上传文件积分', '用户上传文件消耗的积分数', false),
  ('parse_document_points', '20', 'number', 'points', '解析文档积分', '使用 AI 解析需求文档消耗的积分数', false),
  ('generate_proposal_points', '30', 'number', 'points', '生成方案积分', '使用 AI 生成报价方案消耗的积分数', false),
  ('enhance_proposal_points', '15', 'number', 'points', '优化方案积分', '使用 AI 优化/润色方案消耗的积分数', false),
  ('export_quote_points', '5', 'number', 'points', '导出报价积分', '导出报价单消耗的积分数', false),
  ('task_reward_points', '100', 'number', 'points', '完成任务积分', '完成系统任务/活动奖励的积分数', false),
  ('chat_points_per_token', '0.001', 'number', 'points', 'AI 对话积分系数', '每 Token AI 对话消耗的积分', false),
  ('max_points_per_day', '1000', 'number', 'points', '每日获取上限', '用户每日获取积分上限', false),

  -- ===== 安全配置 =====
  ('login_max_attempts', '5', 'number', 'security', '登录最大尝试次数', '锁定前允许的最大登录失败次数', false),
  ('login_lockout_minutes', '30', 'number', 'security', '锁定时长(分钟)', '登录失败过多后的锁定时间', false),
  ('password_min_length', '8', 'number', 'security', '密码最小长度', '用户密码最小字符数', false),
  ('allow_register', 'true', 'boolean', 'security', '开放注册', '是否允许新用户注册', true),
  ('require_email_verify', 'false', 'boolean', 'security', '邮箱验证', '注册后是否需要验证邮箱', false),
  ('session_timeout_hours', '24', 'number', 'security', '会话超时时间(小时)', '用户登录会话过期时间', false),

  -- ===== 存储配置 =====
  ('max_upload_size_mb', '50', 'number', 'storage', '上传大小限制(MB)', '单文件最大上传大小', false),
  ('allowed_file_types', 'pdf,xlsx,xls,csv,doc,docx,jpg,png', 'string', 'storage', '允许的文件类型', '逗号分隔的文件扩展名', false),
  ('default_storage_mb', '100', 'number', 'storage', '默认存储空间(MB)', '新用户默认存储空间', false),
  ('max_product_images', '10', 'number', 'storage', '产品最大图片数', '每个产品最多上传的图片数量', false),
  ('max_quote_attachments', '5', 'number', 'storage', '报价最大附件数', '每个报价单最多上传的附件数量', false)
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================
-- 4. 统一 points_rules 表数值（与 site_config 保持一致）
--    仅更新数值/语义，不新增或删除规则
-- ============================================================

-- 4.1 每日登录: 2 -> 10（与 site_config.daily_login_points 一致）
UPDATE points_rules
SET base_points = 10,
    rule_config = rule_config || '{"points":10,"trigger_condition":"daily_login","daily_limit":1}'::jsonb
WHERE rule_key = 'daily_login'
  AND rule_type = 'reward';

-- 4.2 上传文件: 10 -> 5，且改为消耗类（上传文件扣减积分，与 site_config.upload_file_points 一致）
UPDATE points_rules
SET base_points = 5,
    rule_type = 'consume',
    rule_description = '用户上传文件消耗积分',
    rule_config = rule_config || '{"base_cost":5,"unit_cost":0,"unit_type":"fixed","min_balance":0}'::jsonb
WHERE rule_key = 'upload_file';

-- 4.3 邀请奖励: 保持 50（幂等对齐，防止历史值漂移）
UPDATE points_rules
SET base_points = 50,
    rule_config = rule_config || '{"points":50,"trigger_condition":"invite_friend","total_limit":500}'::jsonb
WHERE rule_key = 'invite_friend'
  AND rule_type = 'reward';

-- 4.4 注册奖励: 保持 100（幂等对齐）
UPDATE points_rules
SET base_points = 100,
    rule_config = rule_config || '{"points":100,"trigger_condition":"register","daily_limit":1,"total_limit":1}'::jsonb
WHERE rule_key = 'register'
  AND rule_type = 'reward';

-- 4.5 消耗类规则与 site_config 对齐
-- 生成方案: 10 -> 30
UPDATE points_rules
SET base_points = 30,
    rule_config = rule_config || '{"base_cost":30}'::jsonb
WHERE rule_key = 'quote_generate_consume'
  AND rule_type = 'consume';

-- 方案增强: 15（保持一致，幂等）
UPDATE points_rules
SET base_points = 15,
    rule_config = rule_config || '{"base_cost":15}'::jsonb
WHERE rule_key = 'enhance_proposal'
  AND rule_type = 'consume';

-- ============================================================
-- 5. 刷新 PostgREST schema 缓存
-- ============================================================
NOTIFY pgrst, 'reload schema';

COMMIT;
