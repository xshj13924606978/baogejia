-- =============================================================
-- 073_member_level_permissions.sql
-- 会员等级 + 字段权限 + 模块权限 统一数据源
-- 对话窗: [#20260824-MEMBERSHIP-OPT]
-- 说明: 解决「等级权限配置」页面数据硬编码、localStorage 不持久化、
--       功能归属混乱（积分管理 vs 会员管理）问题。
-- 数据来源: 截图《等级权限配置》页面（/admin/points/levels）
-- =============================================================

-- 1. 会员等级表
CREATE TABLE IF NOT EXISTS member_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_code VARCHAR(20) UNIQUE NOT NULL,          -- L0, L1, L2, L3, L4
  level_name VARCHAR(50) NOT NULL,                  -- 用户、会员、白银、黄金、白金
  required_points INTEGER NOT NULL DEFAULT 0,       -- 所需积分
  sort_order INTEGER DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  is_enabled BOOLEAN DEFAULT true,
  -- 配额设置（截图「批量更新」功能保留项）
  daily_quota INTEGER DEFAULT 0,                    -- 每日查询配额
  max_files INTEGER DEFAULT 0,                      -- 最大文件数量
  max_chat_messages INTEGER DEFAULT 0,              -- 最大聊天消息数
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 字段权限表
CREATE TABLE IF NOT EXISTS member_field_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_code VARCHAR(20) NOT NULL REFERENCES member_levels(level_code) ON DELETE CASCADE,
  field_key VARCHAR(50) NOT NULL,                   -- can_view_min_price, can_view_cost_price 等
  field_label VARCHAR(100) NOT NULL,                -- 最低售价、成本价、厂家、联系人、电话
  has_permission BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(level_code, field_key)
);

-- 3. 模块权限表
CREATE TABLE IF NOT EXISTS member_module_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_code VARCHAR(20) NOT NULL REFERENCES member_levels(level_code) ON DELETE CASCADE,
  module_key VARCHAR(50) NOT NULL,                  -- chat, quote_generate, history, edit, preview
  module_label VARCHAR(100) NOT NULL,               -- 智能对话、报价生成、历史记录、编辑、预览
  has_permission BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(level_code, module_key)
);

-- 4. 等级权限变更日志（支撑「历史」按钮）
CREATE TABLE IF NOT EXISTS member_level_change_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level_code VARCHAR(20),
  action VARCHAR(20) NOT NULL,                      -- create / update / delete / batch / reset
  change_summary TEXT,
  changed_by VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_level_change_log_level ON member_level_change_log(level_code, created_at DESC);

-- 5. 种子数据：5 个等级（匹配截图：用户/会员/白银/黄金/白金）
INSERT INTO member_levels (level_code, level_name, required_points, sort_order, is_default, daily_quota, max_files, max_chat_messages, description)
VALUES
  ('L0', '用户',   0,    0, true,  0,  0,  0,   '免费用户，基础功能'),
  ('L1', '会员',   100,  1, false, 10, 5,  10,  '初级会员'),
  ('L2', '白银',   500,  2, false, 20, 10, 20,  '白银会员'),
  ('L3', '黄金',   2000, 3, false, 50, 20, 50,  '黄金会员'),
  ('L4', '白金',   10000,4, false, 100, 50, 100, '白金会员')
ON CONFLICT (level_code) DO UPDATE SET
  level_name = EXCLUDED.level_name,
  required_points = EXCLUDED.required_points,
  sort_order = EXCLUDED.sort_order,
  is_default = EXCLUDED.is_default,
  description = EXCLUDED.description,
  updated_at = now();

-- 6. 字段权限种子（匹配截图矩阵）
INSERT INTO member_field_permissions (level_code, field_key, field_label, has_permission, sort_order)
VALUES
  ('L0','can_view_min_price','最低售价',false,1),
  ('L0','can_view_cost_price','成本价',false,2),
  ('L0','can_view_manufacturer','厂家',false,3),
  ('L0','can_view_contact','联系人',false,4),
  ('L0','can_view_phone','电话',false,5),
  ('L1','can_view_min_price','最低售价',true,1),
  ('L1','can_view_cost_price','成本价',false,2),
  ('L1','can_view_manufacturer','厂家',false,3),
  ('L1','can_view_contact','联系人',false,4),
  ('L1','can_view_phone','电话',false,5),
  ('L2','can_view_min_price','最低售价',true,1),
  ('L2','can_view_cost_price','成本价',false,2),
  ('L2','can_view_manufacturer','厂家',true,3),
  ('L2','can_view_contact','联系人',true,4),
  ('L2','can_view_phone','电话',false,5),
  ('L3','can_view_min_price','最低售价',true,1),
  ('L3','can_view_cost_price','成本价',true,2),
  ('L3','can_view_manufacturer','厂家',true,3),
  ('L3','can_view_contact','联系人',true,4),
  ('L3','can_view_phone','电话',false,5),
  ('L4','can_view_min_price','最低售价',true,1),
  ('L4','can_view_cost_price','成本价',true,2),
  ('L4','can_view_manufacturer','厂家',true,3),
  ('L4','can_view_contact','联系人',true,4),
  ('L4','can_view_phone','电话',true,5)
ON CONFLICT (level_code, field_key) DO UPDATE SET
  field_label = EXCLUDED.field_label,
  has_permission = EXCLUDED.has_permission,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- 7. 模块权限种子（匹配截图：所有等级 智能对话/报价生成/历史记录 有权限，编辑/预览 无）
INSERT INTO member_module_permissions (level_code, module_key, module_label, has_permission, sort_order)
SELECT l.level_code, m.module_key, m.module_label, m.has_permission, m.sort_order
FROM (VALUES ('L0'),('L1'),('L2'),('L3'),('L4')) AS l(level_code)
CROSS JOIN (VALUES
  ('chat','智能对话',true,1),
  ('quote_generate','报价生成',true,2),
  ('history','历史记录',true,3),
  ('edit','编辑',false,4),
  ('preview','预览',false,5)
) AS m(module_key, module_label, has_permission, sort_order)
ON CONFLICT (level_code, module_key) DO UPDATE SET
  module_label = EXCLUDED.module_label,
  has_permission = EXCLUDED.has_permission,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- 8. 数据一致性：将种子配置同步到旧 level_definitions（映射 L0-L4 <-> level 1-5）
--    使业务层（userLevelService / product-visibility）实时生效
UPDATE level_definitions ld
SET name = ml.level_name,
    required_points = ml.required_points
FROM (VALUES
  ('L0',1),('L1',2),('L2',3),('L3',4),('L4',5)
) AS map(level_code, lvl)
JOIN member_levels ml ON ml.level_code = map.level_code
WHERE ld.level = map.lvl;

UPDATE level_definitions ld
SET can_view_min_price = fp.has_permission,
    can_view_cost_price = (SELECT has_permission FROM member_field_permissions f2 WHERE f2.level_code = map.level_code AND f2.field_key = 'can_view_cost_price'),
    can_view_manufacturer = (SELECT has_permission FROM member_field_permissions f2 WHERE f2.level_code = map.level_code AND f2.field_key = 'can_view_manufacturer'),
    can_view_contact = (SELECT has_permission FROM member_field_permissions f2 WHERE f2.level_code = map.level_code AND f2.field_key = 'can_view_contact'),
    can_view_phone = (SELECT has_permission FROM member_field_permissions f2 WHERE f2.level_code = map.level_code AND f2.field_key = 'can_view_phone'),
    updated_at = now()
FROM (VALUES ('L0',1),('L1',2),('L2',3),('L3',4),('L4',5)) AS map(level_code, lvl)
JOIN member_levels ml ON ml.level_code = map.level_code
JOIN member_field_permissions fp ON fp.level_code = map.level_code AND fp.field_key = 'can_view_min_price'
WHERE ld.level = map.lvl;
