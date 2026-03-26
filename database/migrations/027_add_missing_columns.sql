-- =============================================================================
-- 027_add_missing_columns.sql
-- 为动态配置表添加缺失列，确保代码与数据库 schema 对齐
-- 执行时间：2026-03-26
-- =============================================================================

-- ============================================================================
-- 1. system_modules 添加缺失列
-- ============================================================================

-- 1.1 group_label: 菜单分组标签（核心业务/运营管理/内容管理/系统管理）
ALTER TABLE system_modules ADD COLUMN IF NOT EXISTS group_label VARCHAR(100) DEFAULT '其他';
COMMENT ON COLUMN system_modules.group_label IS '菜单分组标签，如 核心业务、运营管理、内容管理、系统管理';

-- 1.2 description: 模块描述
ALTER TABLE system_modules ADD COLUMN IF NOT EXISTS description TEXT;
COMMENT ON COLUMN system_modules.description IS '模块描述说明';

-- 1.3 permission_code: 权限代码
ALTER TABLE system_modules ADD COLUMN IF NOT EXISTS permission_code VARCHAR(100);
COMMENT ON COLUMN system_modules.permission_code IS '访问该模块所需的权限代码';

-- ============================================================================
-- 2. system_pages 添加缺失列
-- ============================================================================

-- 2.1 sort_order: 页面排序
ALTER TABLE system_pages ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
COMMENT ON COLUMN system_pages.sort_order IS '页面排序（升序）';

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_sys_page_sort ON system_pages(sort_order);

-- ============================================================================
-- 3. 重建 v_config_change_history 视图，加入 admin_id 列
-- ============================================================================
DROP VIEW IF EXISTS v_config_change_history CASCADE;

CREATE OR REPLACE VIEW v_config_change_history AS
SELECT
    ccl.id,
    ccl.admin_id,
    ccl.target_type,
    ccl.target_id,
    ccl.old_value,
    ccl.new_value,
    ccl.change_description,
    ccl.created_at,
    u.email AS admin_email,
    COALESCE(
        u.metadata->>'name',
        u.metadata->>'nickname',
        u.email
    ) AS admin_name
FROM config_change_logs ccl
LEFT JOIN users u ON ccl.admin_id = u.id
ORDER BY ccl.created_at DESC;

COMMENT ON VIEW v_config_change_history IS '配置变更历史视图 - 关联管理员ID、姓名和邮箱';

-- ============================================================================
-- 4. 更新现有模块的 group_label 值
-- 按照现有 layout.tsx 中 GROUP_CONFIG 的分组逻辑分配
-- ============================================================================

UPDATE system_modules SET group_label = '核心业务' WHERE module_key IN ('dashboard', 'user', 'product', 'quote', 'enterprise', 'audit');
UPDATE system_modules SET group_label = '运营管理' WHERE module_key IN ('membership', 'points', 'points_levels', 'points_rules', 'points_history', 'points_rules_mgr');
UPDATE system_modules SET group_label = '内容管理' WHERE module_key IN ('knowledge', 'knowledge_center', 'import_log');
UPDATE system_modules SET group_label = '系统管理' WHERE module_key IN ('stats', 'analytics', 'module', 'system');

-- ============================================================================
-- 5. 更新现有页面的 sort_order 值
-- 按 018 迁移中的插入顺序排列
-- ============================================================================

-- 仪表盘
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'dashboard_main';

-- 用户管理
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'user_list';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'user_detail';
UPDATE system_pages SET sort_order = 3 WHERE page_key = 'user_grant';

-- 企业管理
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'enterprise_list';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'enterprise_detail';

-- 内容审核
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'audit_pending';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'audit_detail';
UPDATE system_pages SET sort_order = 3 WHERE page_key = 'audit_history';

-- 产品管理
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'product_list';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'product_form';
UPDATE system_pages SET sort_order = 3 WHERE page_key = 'product_detail';
UPDATE system_pages SET sort_order = 4 WHERE page_key = 'product_import';
UPDATE system_pages SET sort_order = 5 WHERE page_key = 'product_duplicate_config';

-- 报价管理
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'quote_list';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'quote_detail';
UPDATE system_pages SET sort_order = 3 WHERE page_key = 'quote_terms';

-- 会员管理
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'membership_levels';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'membership_field_perm';
UPDATE system_pages SET sort_order = 3 WHERE page_key = 'membership_stats';

-- 积分管理
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'points_overview';
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'levels_config';
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'rules_config';
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'points_history';
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'points_rules_list';

-- 数据统计
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'stats_overview';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'stats_revenue';

-- 知识库管理
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'knowledge_list';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'knowledge_form';
UPDATE system_pages SET sort_order = 3 WHERE page_key = 'knowledge_category';

-- 模块管理
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'module_list';

-- 导入日志
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'import_log_list';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'import_log_detail';

-- 系统设置
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'settings_basic';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'settings_security';
UPDATE system_pages SET sort_order = 3 WHERE page_key = 'system_config';

-- 资料中心
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'price_library';
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'document_library';
UPDATE system_pages SET sort_order = 3 WHERE page_key = 'case_library';
UPDATE system_pages SET sort_order = 4 WHERE page_key = 'standard_library';
UPDATE system_pages SET sort_order = 5 WHERE page_key = 'drawing_library';
UPDATE system_pages SET sort_order = 6 WHERE page_key = 'quota_library';
UPDATE system_pages SET sort_order = 7 WHERE page_key = 'global_search';

-- ============================================================================
-- 完成提示
-- =============================================================================

DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '027 迁移完成！';
    RAISE NOTICE '========================================';
    RAISE NOTICE '已添加列:';
    RAISE NOTICE '  system_modules.group_label   - 菜单分组';
    RAISE NOTICE '  system_modules.description   - 模块描述';
    RAISE NOTICE '  system_modules.permission_code - 权限代码';
    RAISE NOTICE '  system_pages.sort_order      - 页面排序';
    RAISE NOTICE '已更新:';
    RAISE NOTICE '  v_config_change_history 视图 (加入 admin_id)';
    RAISE NOTICE '  现有模块 group_label 分组';
    RAISE NOTICE '  现有页面 sort_order 排序';
    RAISE NOTICE '========================================';
END $$;
