-- ============================================================================
-- 058: 资料贡献管理菜单（问题 #20260820-1130）
-- 根因：src/app/admin/contributor/page.tsx 已实现完整审核功能，但 system_modules
--       中无"资料贡献"模块 → 管理后台菜单不渲染该入口，管理员无法查看待审核资料。
-- 修复：插入 system_modules + system_pages，让 /admin/contributor 出现在菜单中
--       （内容管理分组），并在 admin/layout.tsx 对 module_key='contributor' 显示待审核角标。
-- ============================================================================

INSERT INTO system_modules (
  module_key, name_zh, name_en, icon, route_path, sort_order,
  is_enabled, is_visible_in_menu, parent_module_id, config, group_label, description, permission_code
)
VALUES (
  'contributor', '资料贡献', 'Contributor', 'ClipboardList', '/admin/contributor', 37,
  true, true, NULL, '{}'::jsonb, '内容管理', '资料贡献上传与审核', 'admin:contributor'
)
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO system_pages (module_id, page_key, name_zh, route_path, layout_template, is_enabled, config, sort_order)
SELECT m.id, 'contributor_uploads', '资料审核', '/admin/contributor', 'default', true, '{}'::jsonb, 1
FROM system_modules m
WHERE m.module_key = 'contributor'
  AND NOT EXISTS (
    SELECT 1 FROM system_pages p WHERE p.module_id = m.id AND p.page_key = 'contributor_uploads'
  );

-- 幂等校验：输出当前配置便于验证
DO $$
DECLARE
  v_module_id uuid;
  v_pages INTEGER;
BEGIN
  SELECT id INTO v_module_id FROM system_modules WHERE module_key = 'contributor';
  IF v_module_id IS NULL THEN
    RAISE NOTICE '[058] 资料贡献模块未插入成功';
  ELSE
    SELECT count(*) INTO v_pages FROM system_pages WHERE module_id = v_module_id;
    RAISE NOTICE '[058] 资料贡献模块 id=%，页面数=%（应为 1）', v_module_id, v_pages;
  END IF;
END $$;
