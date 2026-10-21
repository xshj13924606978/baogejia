-- 021_add_collection_categories_menu.sql
-- 将「采集类别管理」添加到产品管理模块下作为子页面

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM system_pages sp
    INNER JOIN system_modules sm ON sp.module_id = sm.id
    WHERE sm.module_key = 'products' AND sp.page_key = 'product_collection_categories'
  ) THEN
    INSERT INTO system_pages (module_id, page_key, name_zh, route_path, layout_template, is_enabled, sort_order, config)
    SELECT id, 'product_collection_categories', '采集类别管理', '/admin/products/categories', 'list', true, 6, '{}'
    FROM system_modules
    WHERE module_key = 'products';
  END IF;
END $$;
