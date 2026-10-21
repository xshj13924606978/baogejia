-- ============================================================
-- 迁移: 076_point_log_types
-- 说明: 创建积分流水类型配置表，支持动态类型名称、颜色、图标、
--       可撤销/可编辑/可删除等操作配置，杜绝前端硬编码。
-- ============================================================

BEGIN;

-- ============================================================
-- 1. 积分流水类型配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS point_log_types (
  type_code VARCHAR(50) PRIMARY KEY,
  type_name VARCHAR(100) NOT NULL,
  category VARCHAR(20) NOT NULL DEFAULT 'system' CHECK (category IN ('reward', 'consume', 'system')),
  badge_class VARCHAR(100) NOT NULL DEFAULT 'bg-slate-100 text-slate-700',
  icon_name VARCHAR(50) DEFAULT 'coins',
  display_order INTEGER NOT NULL DEFAULT 50,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_reversible BOOLEAN NOT NULL DEFAULT false,
  is_editable BOOLEAN NOT NULL DEFAULT false,
  is_deletable BOOLEAN NOT NULL DEFAULT false,
  description TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE point_log_types IS '积分流水类型配置表：驱动前端类型标签、颜色、图标及操作按钮';
COMMENT ON COLUMN point_log_types.type_code IS '与 point_logs.type 值保持一致';
COMMENT ON COLUMN point_log_types.category IS 'reward: 奖励/获取; consume: 消费/扣除; system: 系统操作';
COMMENT ON COLUMN point_log_types.badge_class IS 'Tailwind CSS 颜色类，用于类型徽章';
COMMENT ON COLUMN point_log_types.icon_name IS 'Lucide 图标名称';

-- ============================================================
-- 2. 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_point_log_types_category ON point_log_types(category);
CREATE INDEX IF NOT EXISTS idx_point_log_types_active_order ON point_log_types(is_active, display_order);

-- ============================================================
-- 3. RLS 策略
-- ============================================================
ALTER TABLE point_log_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS point_log_types_select_all ON point_log_types;
CREATE POLICY point_log_types_select_all ON point_log_types FOR SELECT USING (true);

DROP POLICY IF EXISTS point_log_types_admin_all ON point_log_types;
CREATE POLICY point_log_types_admin_all ON point_log_types FOR ALL USING (true);

-- ============================================================
-- 4. 触发器：自动更新 updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION update_point_log_types_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_point_log_types_updated_at ON point_log_types;
CREATE TRIGGER trg_point_log_types_updated_at
  BEFORE UPDATE ON point_log_types
  FOR EACH ROW
  EXECUTE FUNCTION update_point_log_types_updated_at();

-- ============================================================
-- 5. 删除备份表（软删除归档）
-- ============================================================
CREATE TABLE IF NOT EXISTS point_logs_deleted (
  id BIGSERIAL PRIMARY KEY,
  original_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  points INTEGER NOT NULL,
  type VARCHAR(50) NOT NULL,
  description TEXT,
  balance_after INTEGER,
  reference_id VARCHAR(255),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL,
  deleted_by VARCHAR(255),
  deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_point_logs_deleted_user_id ON point_logs_deleted(user_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_deleted_type ON point_logs_deleted(type);
CREATE INDEX IF NOT EXISTS idx_point_logs_deleted_deleted_at ON point_logs_deleted(deleted_at);

ALTER TABLE point_logs_deleted ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS point_logs_deleted_admin_all ON point_logs_deleted;
CREATE POLICY point_logs_deleted_admin_all ON point_logs_deleted FOR ALL USING (true);

-- ============================================================
-- 6. 辅助函数：动态同步 point_logs 中已存在但尚未注册的类型
-- ============================================================
CREATE OR REPLACE FUNCTION sync_point_log_types_from_logs()
RETURNS TABLE(added_count INTEGER) AS $$
DECLARE
  v_count INTEGER := 0;
BEGIN
  INSERT INTO point_log_types (type_code, type_name, category, badge_class, icon_name, display_order, is_active, is_reversible, is_editable, is_deletable, description)
  SELECT DISTINCT
    pl.type,
    COALESCE(init.type_name, pl.type),
    COALESCE(init.category, 'system'),
    COALESCE(init.badge_class, 'bg-slate-100 text-slate-700'),
    COALESCE(init.icon_name, 'coins'),
    COALESCE(init.display_order, 50),
    true,
    COALESCE(init.is_reversible, false),
    COALESCE(init.is_editable, false),
    COALESCE(init.is_deletable, false),
    COALESCE(init.description, '')
  FROM point_logs pl
  LEFT JOIN point_log_types plt ON plt.type_code = pl.type
  LEFT JOIN (
    VALUES
      ('register',          '注册奖励',   'reward',  'bg-emerald-100 text-emerald-700',  'gift',           10, false, false, false, '新用户注册奖励'),
      ('daily_login',       '每日登录',   'reward',  'bg-emerald-100 text-emerald-700',  'calendar-check', 11, false, false, false, '每日登录奖励'),
      ('invite_reward',     '邀请奖励',   'reward',  'bg-emerald-100 text-emerald-700',  'user-plus',      12, false, false, false, '邀请好友奖励'),
      ('task_reward',       '任务奖励',   'reward',  'bg-emerald-100 text-emerald-700',  'check-circle',   13, false, false, false, '完成任务奖励'),
      ('knowledge_share',   '知识库分成', 'reward',  'bg-emerald-100 text-emerald-700',  'book-open',      14, false, false, false, '资料被下载/查看的分成收益'),
      ('recharge',          '积分充值',   'reward',  'bg-blue-100 text-blue-700',        'credit-card',    20, true,  true,  false, '积分充值'),
      ('refund',            '积分退款',   'reward',  'bg-blue-100 text-blue-700',        'rotate-ccw',     21, true,  false, false, '积分退款'),
      ('admin_grant',       '管理员发放', 'reward',  'bg-purple-100 text-purple-700',    'shield-check',   30, true,  true,  false, '管理员手动发放积分'),
      ('chat',              '对话消费',   'consume', 'bg-rose-100 text-rose-700',        'message-square', 40, false, false, false, 'AI 对话消费'),
      ('conversation_consume','对话消耗', 'consume', 'bg-rose-100 text-rose-700',        'message-square', 41, false, false, false, 'AI 对话消耗'),
      ('ai_consume',        'AI 消耗',    'consume', 'bg-rose-100 text-rose-700',        'brain',          42, false, false, false, 'AI 服务消耗'),
      ('upload_file',       '上传文件',   'consume', 'bg-orange-100 text-orange-700',    'upload',         43, false, false, false, '上传文件消耗'),
      ('parse_document',    '文档解析',   'consume', 'bg-orange-100 text-orange-700',    'file-text',      44, false, false, false, '文档解析消耗'),
      ('generate_proposal', '生成方案',   'consume', 'bg-orange-100 text-orange-700',    'file-output',    45, false, false, false, '生成方案消耗'),
      ('generate_quote',    '生成报价单', 'consume', 'bg-orange-100 text-orange-700',    'calculator',     46, false, false, false, '生成报价单消耗'),
      ('enhance_proposal',  '方案增强',   'consume', 'bg-orange-100 text-orange-700',    'sparkles',       47, false, false, false, '方案增强消耗'),
      ('export_quote',      '导出报价单', 'consume', 'bg-orange-100 text-orange-700',    'download',       48, false, false, false, '导出报价单消耗'),
      ('exchange',          '兑换消费',   'consume', 'bg-amber-100 text-amber-700',      'shopping-bag',   49, true,  false, false, '积分兑换消费'),
      ('admin_deduct',      '管理员扣除', 'consume', 'bg-red-100 text-red-700',          'shield-alert',   50, true,  true,  false, '管理员手动扣除积分')
  ) AS init(type_code, type_name, category, badge_class, icon_name, display_order, is_reversible, is_editable, is_deletable, description)
    ON init.type_code = pl.type
  WHERE plt.type_code IS NULL
    AND pl.type IS NOT NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  added_count := v_count;
  RETURN NEXT;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 7. 初始化默认类型数据（已存在则跳过）
-- ============================================================
INSERT INTO point_log_types (type_code, type_name, category, badge_class, icon_name, display_order, is_active, is_reversible, is_editable, is_deletable, description)
VALUES
  ('register',          '注册奖励',   'reward',  'bg-emerald-100 text-emerald-700',  'gift',           10, true,  false, false, false, '新用户注册奖励'),
  ('daily_login',       '每日登录',   'reward',  'bg-emerald-100 text-emerald-700',  'calendar-check', 11, true,  false, false, false, '每日登录奖励'),
  ('invite_reward',     '邀请奖励',   'reward',  'bg-emerald-100 text-emerald-700',  'user-plus',      12, true,  false, false, false, '邀请好友奖励'),
  ('task_reward',       '任务奖励',   'reward',  'bg-emerald-100 text-emerald-700',  'check-circle',   13, true,  false, false, false, '完成任务奖励'),
  ('knowledge_share',   '知识库分成', 'reward',  'bg-emerald-100 text-emerald-700',  'book-open',      14, true,  false, false, false, '资料被下载/查看的分成收益'),
  ('recharge',          '积分充值',   'reward',  'bg-blue-100 text-blue-700',        'credit-card',    20, true,  true,  true,  false, '积分充值'),
  ('refund',            '积分退款',   'reward',  'bg-blue-100 text-blue-700',        'rotate-ccw',     21, true,  true,  false, false, '积分退款'),
  ('admin_grant',       '管理员发放', 'reward',  'bg-purple-100 text-purple-700',    'shield-check',   30, true,  true,  true,  false, '管理员手动发放积分'),
  ('chat',              '对话消费',   'consume', 'bg-rose-100 text-rose-700',        'message-square', 40, true,  false, false, false, 'AI 对话消费'),
  ('conversation_consume','对话消耗', 'consume', 'bg-rose-100 text-rose-700',        'message-square', 41, true,  false, false, false, 'AI 对话消耗'),
  ('ai_consume',        'AI 消耗',    'consume', 'bg-rose-100 text-rose-700',        'brain',          42, true,  false, false, false, 'AI 服务消耗'),
  ('upload_file',       '上传文件',   'consume', 'bg-orange-100 text-orange-700',    'upload',         43, true,  false, false, false, '上传文件消耗'),
  ('parse_document',    '文档解析',   'consume', 'bg-orange-100 text-orange-700',    'file-text',      44, true,  false, false, false, '文档解析消耗'),
  ('generate_proposal', '生成方案',   'consume', 'bg-orange-100 text-orange-700',    'file-output',    45, true,  false, false, false, '生成方案消耗'),
  ('generate_quote',    '生成报价单', 'consume', 'bg-orange-100 text-orange-700',    'calculator',     46, true,  false, false, false, '生成报价单消耗'),
  ('enhance_proposal',  '方案增强',   'consume', 'bg-orange-100 text-orange-700',    'sparkles',       47, true,  false, false, false, '方案增强消耗'),
  ('export_quote',      '导出报价单', 'consume', 'bg-orange-100 text-orange-700',    'download',       48, true,  false, false, false, '导出报价单消耗'),
  ('exchange',          '兑换消费',   'consume', 'bg-amber-100 text-amber-700',      'shopping-bag',   49, true,  true,  false, false, '积分兑换消费'),
  ('admin_deduct',      '管理员扣除', 'consume', 'bg-red-100 text-red-700',          'shield-alert',   50, true,  true,  true,  false, '管理员手动扣除积分')
ON CONFLICT (type_code) DO UPDATE SET
  type_name     = EXCLUDED.type_name,
  category      = EXCLUDED.category,
  badge_class   = EXCLUDED.badge_class,
  icon_name     = EXCLUDED.icon_name,
  display_order = EXCLUDED.display_order,
  is_reversible = EXCLUDED.is_reversible,
  is_editable   = EXCLUDED.is_editable,
  is_deletable  = EXCLUDED.is_deletable,
  description   = EXCLUDED.description,
  updated_at    = NOW();

-- 同步 point_logs 中已存在但未注册的类型（兼容历史数据）
SELECT * FROM sync_point_log_types_from_logs();

COMMIT;
