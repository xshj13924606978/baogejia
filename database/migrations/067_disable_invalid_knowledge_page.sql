-- 067: 禁用无效的「资料库」页面配置（route_path=/knowledge）
-- 背景：#20260824-1010 迁移 048 在 system_pages 插入的「资料库」页面
--   route_path='/knowledge' 仅用于绑定 knowledge:view/download/edit/delete 权限，
--   前端并不存在 /knowledge 路由。管理后台菜单 API（/api/admin/config/query/menu）
--   将该页面作为 knowledge_center 模块的 children 返回，侧边栏渲染
--   <Link href="/knowledge"> 触发 Next.js RSC prefetch，控制台报
--   GET /knowledge?_rsc=... 404。
-- 修复：禁用该页面（is_enabled=false），菜单 API 与权限树不再返回它。
--   权限校验走 system_actions（不受 is_enabled 影响），用户端知识库功能不受影响。
-- 注：部署「菜单 API 仅保留 /admin 路由」的代码过滤后可恢复启用该页面
--   （is_enabled=true），届时权限树恢复该页面节点，而菜单不会再渲染 /knowledge。
UPDATE system_pages
SET is_enabled = false
WHERE page_key = 'knowledge'
  AND route_path = '/knowledge'
  AND is_enabled = true;
