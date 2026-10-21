-- ============================================================
-- 055: 报价管理用户端菜单 + quotes 软删除支持
-- 需求：#20260816002 完善「报价管理」用户端菜单功能
-- 1. quotes 表补充 deleted_at 软删除列 + 常用索引
-- 2. 用户菜单新增「报价管理」分组（与「我的账户」「商务信息」平级）
--    - 我的报价单 → navigate /quotes
--    - 新建报价   → navigate /（首页 ChatArea 对话生成报价）
-- ============================================================

-- ============================================================
-- 1. quotes 表补充软删除列与索引
-- ============================================================
ALTER TABLE quotes
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN quotes.deleted_at IS '软删除时间，NULL 表示未删除';

CREATE INDEX IF NOT EXISTS idx_quotes_user_id ON quotes(user_id);
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_deleted_at ON quotes(deleted_at) WHERE deleted_at IS NULL;

-- 修复报价单号生成触发器：
-- 原逻辑 SUBSTRING(quote_number FROM '\d+$') 贪婪匹配整个编号串（全为数字），
-- LPAD 截断后序列号计算错误，连续插入会生成重复编号。
-- 改为匹配末尾 4 位序号。
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
  year_prefix TEXT;
  month_prefix TEXT;
  sequence_num INTEGER;
BEGIN
  year_prefix = to_char(NOW(), 'YYYY');
  month_prefix = to_char(NOW(), 'MM');

  SELECT COALESCE(MAX(CAST(SUBSTRING(quote_number FROM '\d{4}$') AS INTEGER)), 0) + 1
  INTO sequence_num
  FROM quotes
  WHERE quote_number LIKE year_prefix || month_prefix || '%';

  NEW.quote_number = year_prefix || month_prefix || LPAD(sequence_num::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. 用户菜单新增「报价管理」分组
--    插入到「我的账户」与「商务信息」之间（现有 sort_order 整体后移）
-- ============================================================
DO $$
DECLARE
    v_menu_id UUID;
BEGIN
    -- 后移现有分组，为新分组腾出位置
    UPDATE user_menus SET sort_order = sort_order + 1, updated_at = NOW()
    WHERE sort_order >= 2;

    -- 报价管理分组（幂等）
    IF NOT EXISTS (SELECT 1 FROM user_menus WHERE menu_key = 'quote_management') THEN
        INSERT INTO user_menus (menu_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible, description, config)
        VALUES ('quote_management', '报价管理', 'Quote Management', 'FileText', 2, TRUE, TRUE, '报价单管理与创建', '{}')
        RETURNING id INTO v_menu_id;

        -- 我的报价单
        IF NOT EXISTS (SELECT 1 FROM user_pages WHERE page_key = 'my_quotes') THEN
            INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, sort_order, is_enabled, is_visible, config)
            VALUES (v_menu_id, 'my_quotes', '我的报价单', 'FileText', '/quotes', 'navigate', 1, TRUE, TRUE, '{}');
        END IF;

        -- 新建报价（跳转首页，通过对话生成报价）
        IF NOT EXISTS (SELECT 1 FROM user_pages WHERE page_key = 'new_quote') THEN
            INSERT INTO user_pages (menu_id, page_key, name_zh, icon, route_path, action_type, sort_order, is_enabled, is_visible, config)
            VALUES (v_menu_id, 'new_quote', '新建报价', 'PlusCircle', '/', 'navigate', 2, TRUE, TRUE, '{}');
        END IF;
    END IF;
END $$;
