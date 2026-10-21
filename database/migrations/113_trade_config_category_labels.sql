-- ============================================================
-- 迁移: 113_trade_config_category_labels
-- 说明: 交易配置分类中文标签字典（#[20260829-2343] 全局汉化-交易配置）
--   原硬编码在 src/lib/trade-config-service.ts 的 TRADE_CONFIG_CATEGORY_LABEL
--   改为数据库驱动（category code 仅作为 trade_config.category 的英文字段值，
--   UI 渲染时通过本字典翻译为中文）。新增/修改/启停类别映射，UI 立即生效。
--
-- 设计：
--   code: 英文字段值（与 trade_config.category CHECK 约束保持一致）
--   name_zh: 中文标签
--   display_order: UI 排序（filter 下拉）
--   is_active: 软启用/停用
--
-- 兼容：
--   迁移 113 未应用时，前端 service 提供内置 fallback（含全部 7 类），
--   保证不汉化也不报错。
-- ============================================================

CREATE TABLE IF NOT EXISTS trade_config_category_labels (
  code VARCHAR(50) PRIMARY KEY,
  name_zh VARCHAR(50) NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE trade_config_category_labels IS '交易配置分类中文标签字典（#20260829-2343）';

-- 索引（filter 按 display_order 排序时用到）
CREATE INDEX IF NOT EXISTS idx_trade_config_category_labels_order
  ON trade_config_category_labels(is_active, display_order);

-- 种子 7 条（与 trade_config.category CHECK 约束保持一致）
INSERT INTO trade_config_category_labels (code, name_zh, display_order) VALUES
  ('system',     '系统',  1),
  ('payment',    '支付',  2),
  ('membership', '会员',  3),
  ('token',      'Token', 4),
  ('brand',      '品牌',  5),
  ('mall',       '商城',  6),
  ('withdraw',   '提现',  7)
ON CONFLICT (code) DO UPDATE SET
  name_zh       = EXCLUDED.name_zh,
  display_order = EXCLUDED.display_order,
  updated_at    = NOW();

-- RLS：所有人可读激活项；超管可写
ALTER TABLE trade_config_category_labels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active trade config category labels" ON trade_config_category_labels;
CREATE POLICY "Anyone can view active trade config category labels"
  ON trade_config_category_labels FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Super admins can manage trade config category labels" ON trade_config_category_labels;
CREATE POLICY "Super admins can manage trade config category labels"
  ON trade_config_category_labels FOR ALL
  USING (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'))
  WITH CHECK (auth.uid() IN (SELECT id FROM users WHERE role = 'super_admin'));
