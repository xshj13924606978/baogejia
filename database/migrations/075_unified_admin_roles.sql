-- =====================================================
-- 075. 统一管理员角色（Roles）+ RBAC 实时动态关联
-- 目的：消除代码里硬编码的 ADMIN_ROLES 数组，统一从数据库读取
-- 关联：
--   - permissions（已有）：权限码定义
--   - role_permissions（已有）：角色 ↔ 权限映射
--   - user_roles（已有）：用户 ↔ 角色映射
--   - users（已有）：用户基本信息（含 role 列）
-- 触发：用户报告 /admin/membership/level-permissions → GET /api/admin/member-levels 403
-- 解决：把管理员/超管/角色码全部收敛到 roles 表，API/前端 layout 全部从数据库读
-- =====================================================

BEGIN;

-- 1. roles 表：角色元信息（中文名、英文名、是否管理员、优先级、是否启用）
CREATE TABLE IF NOT EXISTS roles (
  code              VARCHAR(64) PRIMARY KEY,           -- 主键：角色代码
  name_zh           VARCHAR(128) NOT NULL,             -- 中文名（如"超级管理员"）
  name_en           VARCHAR(128) NOT NULL,             -- 英文名（如"Super Admin"）
  is_super_admin    BOOLEAN NOT NULL DEFAULT false,    -- 是否超级管理员（最高权限）
  is_admin          BOOLEAN NOT NULL DEFAULT false,    -- 是否管理员（含 super_admin）
  level_priority    INTEGER NOT NULL DEFAULT 0,        -- 数字越大优先级越高（用于排序）
  description       TEXT,                              -- 角色说明
  is_active         BOOLEAN NOT NULL DEFAULT true,     -- 是否启用（禁用后全代码不再识别）
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT roles_priority_range CHECK (level_priority BETWEEN 0 AND 1000)
);

CREATE INDEX IF NOT EXISTS idx_roles_admin_active
  ON roles (is_admin, is_super_admin, is_active)
  WHERE is_active = true;

COMMENT ON TABLE  roles IS '统一角色表：取代代码里硬编码的 ADMIN_ROLES 数组 + ROLE_NAME_MAP 中静态映射；API/前端 layout 通过函数读取，实时生效';
COMMENT ON COLUMN roles.code IS '角色代码（主键）。如 super_admin / admin / 管理员（兼容历史 token role 字段）';
COMMENT ON COLUMN roles.is_admin IS '为 true 时，权限检查器认作管理员（含 super_admin）';
COMMENT ON COLUMN roles.is_super_admin IS '为 true 时，仅 super_admin 通过的 API（如审计/系统配置）放行';

-- 2. 种子数据：覆盖所有历史已使用的角色写法
--    这些都是历史上 token.user_role / users.role 列可能出现的字符串
INSERT INTO roles (code, name_zh, name_en, is_super_admin, is_admin, level_priority, description) VALUES
  ('super_admin',        '超级管理员',  'Super Admin',        true,  true, 1000, '系统最高权限（迁移自历史角色码）'),
  ('admin',              '系统管理员',  'Admin',              false, true, 800,  '系统管理员（迁移自历史角色码"系统管理员"）'),
  ('管理员',              '管理员',      'Admin (legacy zh)',  false, true, 700,  '历史中文管理员（兼容）'),
  ('超级管理员',          '超级管理员',  'Super Admin (zh)',   true,  true, 950,  '历史中文超级管理员（兼容）'),
  ('系统管理员',          '系统管理员',  'System Admin',       false, true, 750,  '历史中文系统管理员（兼容）'),
  ('enterprise_admin',   '企业管理员',  'Enterprise Admin',   false, true, 600,  '企业/租户层管理员'),
  ('Admin',              'Admin',       'Admin (uppercase)',  false, true, 800,  '历史大写 admin（兼容，不区分大小写）'),
  ('SUPER_ADMIN',        'Super Admin', 'Super Admin (upper)', true, true, 980, '历史全大写 super_admin（兼容）'),
  ('administrator',      'Administrator', 'Administrator',    false, true, 700,  '历史 administrator（兼容）'),
  ('SUPER',              'Super',       'Super',              true,  true, 990,  '历史短码 SUPER（兼容）'),
  ('ADMIN',              'Admin',       'Admin (uppercase)',  false, true, 790,  '历史全大写 ADMIN（兼容）'),
  ('vip',                'VIP 会员',    'VIP',                false, false, 400, '付费会员 VIP'),
  ('premium',            '付费会员',    'Premium',            false, false, 300, '付费会员'),
  ('free',               '免费用户',    'Free',               false, false, 100, '免费用户'),
  ('user',               '普通用户',    'User',               false, false, 50,  '普通注册用户'),
  ('pending',            '待审核',      'Pending',            false, false, 10,  '待审核用户'),
  ('guest',              '访客',        'Guest',              false, false, 1,   '未登录访客')
ON CONFLICT (code) DO UPDATE SET
  name_zh = EXCLUDED.name_zh,
  name_en = EXCLUDED.name_en,
  is_super_admin = EXCLUDED.is_super_admin,
  is_admin = EXCLUDED.is_admin,
  level_priority = EXCLUDED.level_priority,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = NOW();

-- 3. 函数：获取所有管理员角色代码（用于取代硬编码 ADMIN_ROLES）
--    注意：包含大小写不敏感的规范化匹配（数据库 B树索引自动支持）
CREATE OR REPLACE FUNCTION get_admin_role_codes()
RETURNS TABLE(code VARCHAR)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
    SELECT r.code::VARCHAR
    FROM roles r
    WHERE r.is_active = true
      AND r.is_admin = true
    ORDER BY r.level_priority DESC, r.code ASC;
END;
$$;

COMMENT ON FUNCTION get_admin_role_codes() IS '返回所有当前激活的管理员角色 code（含 super_admin）。取代代码里 ADMIN_ROLES 数组，实时动态读取。';

-- 4. 函数：判断 user 是否为管理员
--    入参：user_id（支持本地 ID 或 DB UUID；如果失败回退到 email 匹配）
--    返回：boolean
CREATE OR REPLACE FUNCTION is_user_admin(p_user_id VARCHAR, p_email VARCHAR DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- 方法 1：user_roles 表
  IF p_user_id IS NOT NULL THEN
    SELECT role INTO v_role
    FROM user_roles
    WHERE user_id::text = p_user_id::text
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_role IS NOT NULL THEN
      RETURN EXISTS (
        SELECT 1 FROM roles
        WHERE code = v_role
          AND is_active = true
          AND is_admin = true
      );
    END IF;
  END IF;

  -- 方法 2：users.metadata.role 或 users.role 列
  IF p_email IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(COALESCE(u.role, ''), ''),
      NULLIF(COALESCE(u.metadata->>'role', ''), '')
    )
    INTO v_role
    FROM users u
    WHERE u.email = p_email
    LIMIT 1;
    IF v_role IS NOT NULL THEN
      RETURN EXISTS (
        SELECT 1 FROM roles
        WHERE code = v_role
          AND is_active = true
          AND is_admin = true
      );
    END IF;
  END IF;

  -- 方法 3：profiles.metadata.role
  IF p_user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(p.metadata->>'role', ''), '')
    INTO v_role
    FROM profiles p
    WHERE p.id::text = p_user_id::text
    LIMIT 1;
    IF v_role IS NOT NULL AND v_role <> '' THEN
      RETURN EXISTS (
        SELECT 1 FROM roles
        WHERE code = v_role
          AND is_active = true
          AND is_admin = true
      );
    END IF;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION is_user_admin(VARCHAR, VARCHAR) IS '基于数据库 roles 表统一判定用户是否为管理员（实时生效，不再依赖硬编码）。支持 user_id 与 email 双入参。';

-- 5. 函数：判断 user 是否为超级管理员
CREATE OR REPLACE FUNCTION is_user_super_admin(p_user_id VARCHAR, p_email VARCHAR DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- user_roles（最新一条）
  IF p_user_id IS NOT NULL THEN
    SELECT role INTO v_role
    FROM user_roles
    WHERE user_id::text = p_user_id::text
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_role IS NOT NULL THEN
      RETURN EXISTS (
        SELECT 1 FROM roles
        WHERE code = v_role
          AND is_active = true
          AND is_super_admin = true
      );
    END IF;
  END IF;

  -- users.role 或 users.metadata.role
  IF p_email IS NOT NULL THEN
    SELECT COALESCE(
      NULLIF(COALESCE(u.role, ''), ''),
      NULLIF(COALESCE(u.metadata->>'role', ''), '')
    )
    INTO v_role
    FROM users u
    WHERE u.email = p_email
    LIMIT 1;
    IF v_role IS NOT NULL THEN
      RETURN EXISTS (
        SELECT 1 FROM roles
        WHERE code = v_role
          AND is_active = true
          AND is_super_admin = true
      );
    END IF;
  END IF;

  -- profiles.metadata.role
  IF p_user_id IS NOT NULL THEN
    SELECT p.metadata->>'role' INTO v_role
    FROM profiles p
    WHERE p.id::text = p_user_id::text
    LIMIT 1;
    IF v_role IS NOT NULL AND v_role <> '' THEN
      RETURN EXISTS (
        SELECT 1 FROM roles
        WHERE code = v_role
          AND is_active = true
          AND is_super_admin = true
      );
    END IF;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION is_user_super_admin(VARCHAR, VARCHAR) IS '基于数据库 roles 表统一判定用户是否为超级管理员。';

-- 6. 视图：提供统一的"用户 → 管理员角色码"查询
--    前端 layout 通过此视图判断显示菜单
CREATE OR REPLACE VIEW user_admin_roles AS
SELECT
  ur.user_id::text AS user_id,
  ur.role AS role_code,
  r.name_zh,
  r.name_en,
  r.is_super_admin,
  r.is_admin,
  r.level_priority
FROM user_roles ur
JOIN roles r ON r.code = ur.role AND r.is_active = true
WHERE r.is_admin = true;

COMMENT ON VIEW user_admin_roles IS '所有当前为"管理员"的 user_id 列表（基于 roles 表实时联动）。前端 layout 可用它判断菜单显示。';

COMMIT;

-- 应用到生产时执行：psql "$DATABASE_URL" -f 075_unified_admin_roles.sql
