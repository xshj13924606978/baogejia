-- 068: 清理管理后台无页面/重复/冗余菜单配置
-- 背景：#20260824-MENU-OPT 管理后台菜单整合优化
-- 说明：
--   1. 删除无页面菜单（品牌对比404、产品价格库/资料分类管理无菜单入口）
--   2. 删除知识库管理3个冗余页面（已合并进资料中心；不影响 contributor 资料贡献）
--   3. 隐藏 import-logs 模块（已合并进产品管理，菜单不再显示）
--   4. 保留并修正客户管理模块（归入核心业务，route_path 改为 /admin/customers）
--   5. 补录 knowledge/import-config 孤儿页面菜单入口
-- 保留项：资料贡献（contributor）、积分规则管理（points-rules）、积分兑换配置（points/rules）
--   两个积分功能独立保留，本迁移不做任何积分相关删除。

BEGIN;

-- 1. 删除无页面菜单
DELETE FROM system_pages
WHERE route_path IN (
  '/admin/chat/brand-compare',                  -- 品牌对比：app/admin/chat 目录不存在，访问404
  '/admin/knowledge-center/price-library',      -- 产品价格库：无菜单入口，与资料库功能重叠
  '/admin/knowledge-center/categories'          -- 资料分类管理：与 /admin/knowledge/category 重复
);

-- 2. 删除知识库管理冗余页面（knowledge 模块，已合并进资料中心）
--    ⚠️ 仅删除 knowledge 模块下页面，不影响 contributor（资料贡献）模块
DELETE FROM system_pages
WHERE module_id = (SELECT id FROM system_modules WHERE module_key = 'knowledge')
  AND route_path IN ('/admin/knowledge', '/admin/knowledge/new', '/admin/knowledge/category');

-- 3. import-logs 模块不修改可见性（保持 is_visible_in_menu = true）
--    ⚠️ 原因：菜单 API（/api/admin/config/query/menu）对普通管理员会先过滤
--    is_visible_in_menu=false 的模块，若此处设为 false，则「产品管理→日志列表」
--    的合并逻辑将不执行，普通管理员将丢失日志列表入口（功能被破坏）。
--    现状已通过 API 合并逻辑将 import-logs 归入产品管理，不会单独显示在运营管理分组。
--    因此本迁移不修改 import-logs 的 is_visible_in_menu。

-- 4. 保留并修正客户管理模块（与用户管理同级，归入核心业务）
UPDATE system_modules
SET group_label = '核心业务',
    route_path = '/admin/customers'
WHERE module_key = 'customer_management';

-- 同步更新对应页面 route_path（/customers → /admin/customers）
UPDATE system_pages
SET route_path = '/admin/customers'
WHERE module_id = (SELECT id FROM system_modules WHERE module_key = 'customer_management')
  AND route_path = '/customers';

-- 5. 补录知识库导入配置菜单入口（孤儿页面：有页面文件，无 system_pages 记录）
INSERT INTO system_pages (module_id, page_key, name_zh, route_path, layout_template, is_enabled, sort_order)
SELECT id, 'import_config', '导入配置', '/admin/knowledge/import-config', 'default', true, 1
FROM system_modules
WHERE module_key = 'knowledge'
  AND NOT EXISTS (
    SELECT 1 FROM system_pages WHERE route_path = '/admin/knowledge/import-config'
  );

-- 6. 修正 knowledge 模块归类（确保归入内容管理分组，幂等）
UPDATE system_modules
SET group_label = '内容管理'
WHERE module_key = 'knowledge';

COMMIT;
