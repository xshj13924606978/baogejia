-- ============================================================
-- 040_fix_points_and_menu.sql
-- 一次性修复：积分显示 + 系统管理菜单
-- ============================================================

-- ============================================================
-- PART 1: 确保所有积分相关表存在
-- ============================================================

-- level_definitions（user-level-service 依赖）
CREATE TABLE IF NOT EXISTS level_definitions (
  id SERIAL PRIMARY KEY,
  level INTEGER NOT NULL UNIQUE,
  name VARCHAR(50) NOT NULL,
  required_points INTEGER NOT NULL DEFAULT 0,
  role VARCHAR(20) NOT NULL DEFAULT 'free',
  permissions TEXT[] DEFAULT '{}',
  daily_quota INTEGER DEFAULT 10,
  max_files INTEGER DEFAULT 5,
  max_chat_messages INTEGER DEFAULT 50,
  can_view_cost_price BOOLEAN DEFAULT false,
  can_view_min_price BOOLEAN DEFAULT false,
  can_view_manufacturer BOOLEAN DEFAULT false,
  can_view_contact BOOLEAN DEFAULT false,
  can_view_phone BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO level_definitions (level, name, required_points, role, daily_quota, max_files, max_chat_messages)
VALUES
  (1, '等级1', 0, 'free', 10, 5, 50),
  (2, '等级2', 500, 'basic', 20, 10, 100),
  (3, '等级3', 2000, 'standard', 50, 20, 200),
  (4, '等级4', 5000, 'premium', 100, 50, 500),
  (5, '等级5', 10000, 'vip', 200, 100, 1000)
ON CONFLICT (level) DO NOTHING;

-- user_levels
CREATE TABLE IF NOT EXISTS user_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  level INTEGER DEFAULT 1,
  current_points INTEGER DEFAULT 0,
  next_level_points INTEGER DEFAULT 0,
  level_name VARCHAR(50),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_levels_user_id ON user_levels(user_id);

-- user_token_balance
CREATE TABLE IF NOT EXISTS user_token_balance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  points_balance INTEGER DEFAULT 0,
  token_balance INTEGER DEFAULT 0,
  total_consumed_tokens INTEGER DEFAULT 0,
  total_consumed_points INTEGER DEFAULT 0,
  total_recharged_points INTEGER DEFAULT 0,
  total_recharged_amount DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_token_balance_user_id ON user_token_balance(user_id);

-- token_consumption_log
CREATE TABLE IF NOT EXISTS token_consumption_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id VARCHAR(100),
  tokens_used INTEGER DEFAULT 0,
  points_cost INTEGER DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_token_consumption_user_id ON token_consumption_log(user_id);

-- point_records
CREATE TABLE IF NOT EXISTS point_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  points INTEGER NOT NULL DEFAULT 0,
  type VARCHAR(50),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_point_records_user_id ON point_records(user_id);

-- ============================================================
-- PART 2: 补全所有用户的积分数据
-- ============================================================

INSERT INTO user_levels (user_id, level, current_points, next_level_points, updated_at)
SELECT u.id, COALESCE((u.metadata->>'level')::integer, 1), COALESCE((u.metadata->>'points')::integer, 100), 0, NOW()
FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_levels ul WHERE ul.user_id = u.id)
ON CONFLICT DO NOTHING;

INSERT INTO user_token_balance (user_id, points_balance, token_balance, updated_at)
SELECT u.id, COALESCE((u.metadata->>'points')::integer, 100), 0, NOW()
FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_token_balance utb WHERE utb.user_id = u.id)
ON CONFLICT DO NOTHING;

UPDATE user_levels ul SET current_points = COALESCE((u.metadata->>'points')::integer, ul.current_points, 100), updated_at = NOW()
FROM users u WHERE ul.user_id = u.id;

UPDATE user_token_balance utb SET points_balance = COALESCE((u.metadata->>'points')::integer, utb.points_balance, 100), updated_at = NOW()
FROM users u WHERE utb.user_id = u.id;

-- ============================================================
-- PART 3: 补全用户菜单 - 系统管理
-- ============================================================

-- 检查 user_menus 表是否存在
DO $$
DECLARE
  max_sort INTEGER;
  v_menu_id UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_menus') THEN
    RAISE NOTICE 'user_menus 表不存在，跳过菜单修复';
    RETURN;
  END IF;

  -- 检查是否已有 system_mgmt 分组
  IF NOT EXISTS (SELECT 1 FROM user_menus WHERE menu_key = 'system_mgmt') THEN
    SELECT COALESCE(MAX(sort_order), 0) INTO max_sort FROM user_menus;

    INSERT INTO user_menus (menu_key, name_zh, name_en, icon, sort_order, is_enabled, is_visible)
    VALUES ('system_mgmt', '系统管理', 'System Management', 'Settings', max_sort + 1, true, true);

    SELECT id INTO v_menu_id FROM user_menus WHERE menu_key = 'system_mgmt';

    RAISE NOTICE '已插入 system_mgmt 菜单分组及子页面';

    -- 插入系统管理子页面
    INSERT INTO user_pages (menu_id, page_key, name_zh, name_en, route_path, sort_order, is_enabled) VALUES
      (v_menu_id, 'admin', '后台管理', 'Admin Panel', '/admin', 1, true),
      (v_menu_id, 'account_management', '账户管理', 'Account Management', '/account', 2, true),
      (v_menu_id, 'settings', '系统设置', 'System Settings', '/settings', 3, true),
      (v_menu_id, 'help', '帮助中心', 'Help Center', '/help', 4, true);

    RAISE NOTICE '已插入 system_mgmt 菜单分组及子页面';
  ELSE
    RAISE NOTICE 'system_mgmt 菜单已存在';
  END IF;
END $$;

-- 刷新缓存
NOTIFY pgrst, 'reload schema';
