-- ============================================================
-- 053: 管理后台 - 积分扣费配置页面菜单注册
-- 需求：#20260816001 资料中心权限控制与积分分成机制
-- ============================================================

INSERT INTO system_pages (id, module_id, page_key, name_zh, route_path, is_enabled, sort_order)
VALUES (
    'b0000001-0000-0000-0000-000000000081',
    'a0000001-0000-0000-0000-000000000020',
    'points_download_config',
    '积分扣费配置',
    '/admin/points/download-config',
    TRUE,
    3
)
ON CONFLICT (id) DO UPDATE SET
    page_key = EXCLUDED.page_key,
    name_zh = EXCLUDED.name_zh,
    route_path = EXCLUDED.route_path,
    is_enabled = EXCLUDED.is_enabled,
    sort_order = EXCLUDED.sort_order;
