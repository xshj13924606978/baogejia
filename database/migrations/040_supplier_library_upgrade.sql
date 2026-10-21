-- 040: 供应方信息升级为供应方资料库
-- 将"供应方信息"菜单项升级为"供应方资料库"，跳转到独立页面

UPDATE user_pages
SET name_zh = '供应方资料库',
    route_path = '/suppliers',
    action_type = 'navigate',
    config = '{}'
WHERE page_key = 'supplier_info';
