-- ============================================================
-- 迁移: 125_report_module_p2p3_fixes
-- 对话窗: #[20260901-0900] 数据与报表模块 P2+P3 综合修复
-- 基于审计: #[202608311800]（第四轮：数据与报表模块）
-- 内容:
--   1. migration_records   迁移执行台账表（P3-2）
--   2. business_reports    业务周报/月报持久化表（P3-1）
--   3. report_view 权限码  + 管理员角色授权（P2-2）
--   4. member_module_permissions 增加 report_view 等级配置行（L0-L4 默认关闭，
--      保持现状仅管理员可见；管理员可在「等级权限配置」按需开放）
--   5. trade_config 种子 scheduler.business_report（周/月报 cron 配置）
--   6. 自登记本迁移到 migration_records
-- 幂等性: 全部 CREATE IF NOT EXISTS / NOT EXISTS 守卫，可重复执行
-- 执行方式: Supabase SQL Editor 或 exec_sql(sql_query)（不使用 BEGIN/COMMIT）
-- ============================================================

-- ------------------------------------------------------------
-- 1. 迁移执行台账表（P3-2）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS migration_records (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_key varchar NOT NULL UNIQUE,          -- 如 125_report_module_p2p3_fixes
  file_name     varchar,
  description   text,
  status        varchar NOT NULL DEFAULT 'success', -- success / failed
  executor      varchar,                            -- 执行来源（exec-sql-http / sql-editor / exec_sql RPC）
  checksum      varchar,                            -- 文件 sha256（可选）
  duration_ms   integer,
  error_message text,
  executed_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_migration_records_executed_at ON migration_records (executed_at DESC);

-- ------------------------------------------------------------
-- 2. 业务周报/月报持久化表（P3-1）
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS business_reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type   varchar NOT NULL CHECK (report_type IN ('weekly', 'monthly')),
  period_start  timestamptz NOT NULL,             -- 统计区间 [period_start, period_end)
  period_end    timestamptz NOT NULL,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb, -- 报表数据（真实聚合，无 mock）
  status        varchar NOT NULL DEFAULT 'success', -- success / failed
  error_message text,
  duration_ms   integer,
  generated_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_type, period_start)              -- 幂等：同期重跑覆盖更新
);
CREATE INDEX IF NOT EXISTS idx_business_reports_type_period ON business_reports (report_type, period_start DESC);

-- ------------------------------------------------------------
-- 3. report_view 权限码（P2-2）+ 管理员角色授权（RBAC 联动）
-- ------------------------------------------------------------
INSERT INTO permissions (code, name, name_en, category, description, is_active)
SELECT 'report_view', '报表查看', 'Report View', 'report',
       '查看数据统计与报表（管理后台 数据统计/数据分析 及其 API）', true
WHERE NOT EXISTS (SELECT 1 FROM permissions WHERE code = 'report_view');

-- 管理员/超级管理员授予 report_view（幂等）
INSERT INTO role_permissions (role, permission_id, granted)
SELECT r.role, p.id, true
FROM (VALUES ('admin'), ('super_admin')) AS r(role)
CROSS JOIN permissions p
WHERE p.code = 'report_view'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role = r.role AND rp.permission_id = p.id
  );

-- ------------------------------------------------------------
-- 4. member_module_permissions 增加 report_view（L0-L4 默认关闭）
--    判定链：管理员直通 → RBAC 显式拒绝 → 本表 DB 配置 → 代码默认矩阵（全关）
-- ------------------------------------------------------------
INSERT INTO member_module_permissions (level_code, module_key, module_label, has_permission, sort_order)
SELECT v.level_code, 'report_view', '报表查看', false, 10
FROM (VALUES ('L0'), ('L1'), ('L2'), ('L3'), ('L4')) AS v(level_code)
WHERE NOT EXISTS (
  SELECT 1 FROM member_module_permissions m
  WHERE m.level_code = v.level_code AND m.module_key = 'report_view'
);

-- ------------------------------------------------------------
-- 5. 业务周/月报调度配置种子（P3-1）
-- ------------------------------------------------------------
INSERT INTO trade_config (config_key, config_value, config_type, description, category)
SELECT 'scheduler.business_report',
       jsonb_build_object(
         'enabled', true,
         'weeklySchedule', '20 4 * * 1',
         'monthlySchedule', '40 4 1 * *'
       ),
       'json',
       '业务周报/月报定时生成（#20260901-0900）：enabled 总开关；weeklySchedule 周报 cron（默认每周一 04:20）；monthlySchedule 月报 cron（默认每月 1 日 04:40）。修改 cron 需重启进程生效',
       'system'
WHERE NOT EXISTS (SELECT 1 FROM trade_config WHERE config_key = 'scheduler.business_report');

-- ------------------------------------------------------------
-- 6. 自登记迁移台账 + 校验输出
-- ------------------------------------------------------------
INSERT INTO migration_records (migration_key, file_name, description, status, executor)
SELECT '125_report_module_p2p3_fixes', '125_report_module_p2p3_fixes.sql',
       '#20260901-0900 数据与报表模块 P2+P3 修复：report_view 权限、迁移台账、业务周/月报表',
       'success', 'migration-125-self'
WHERE NOT EXISTS (
  SELECT 1 FROM migration_records WHERE migration_key = '125_report_module_p2p3_fixes'
);

DO $$
DECLARE
  v_perm INT;
  v_grant INT;
  v_module INT;
BEGIN
  SELECT count(*) INTO v_perm FROM permissions WHERE code = 'report_view';
  SELECT count(*) INTO v_grant FROM role_permissions rp
    JOIN permissions p ON p.id = rp.permission_id
    WHERE p.code = 'report_view' AND rp.granted = true;
  SELECT count(*) INTO v_module FROM member_module_permissions WHERE module_key = 'report_view';
  RAISE NOTICE '============================================';
  RAISE NOTICE '[125] 数据与报表模块 P2+P3 修复迁移完成';
  RAISE NOTICE '  report_view 权限码: %（应为 1）', v_perm;
  RAISE NOTICE '  管理员角色授权:     %（应为 2）', v_grant;
  RAISE NOTICE '  等级权限配置行:     %（应为 5）', v_module;
  RAISE NOTICE '============================================';
END $$;
