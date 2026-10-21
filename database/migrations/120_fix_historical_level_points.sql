-- ============================================================
-- 迁移: 120_fix_historical_level_points
-- 对话窗: [#202608302901-历史数据修复]
-- 说明:
--   修复历史 bug（#202608302900 已在代码层修复，本迁移修复存量数据）：
--   userLevelService.setUserLevel 曾把 user_levels.current_points 写成
--   目标等级的 required_points（如 150 积分的用户兑换黄金后变成 2000 分），
--   导致积分三处存储（users.points / user_token_balance.points_balance /
--   user_levels.current_points）长期不一致。
--
-- 权威口径（沿用迁移 118）：
--   实际积分 = COALESCE(users.points, COALESCE((users.metadata->>'points')::integer, 0))
--   与 check_points_consistency() 内的表达式**完全一致**，
--   否则 users.points 为 NULL 的行修完仍会被巡检判为不一致。
--
-- 处理步骤:
--   1. 全量修复 user_levels.current_points → 实际积分（不限 level_source）
--   2. 仅对 level_source='points' 的行按积分重算 level 与 next_level_points
--      （exchange / purchase / admin 来源的等级是兑换/购买/管理员显式设置的，
--        重算会把这些等级降级，属于数据破坏，故排除）
--   3. 补齐缺失的 user_token_balance 行（仅 INSERT，不覆盖已有余额）
--   4. 校验输出：check_points_consistency() 剩余行数 + 余额侧剩余差异数
--
-- 幂等性: 步骤 1/2 仅更新「当前值 ≠ 目标值」的行；步骤 3 用 ON CONFLICT DO NOTHING。
--         可重复执行，第二次执行影响行数为 0。
-- 执行方式: Supabase SQL Editor 或 exec_sql(sql_query)
--           （不使用 BEGIN/COMMIT，便于通过 Supabase REST 应用）
-- ============================================================

DO $$
DECLARE
  v_has_source     BOOLEAN;
  v_fixed_points   INTEGER := 0;
  v_fixed_level    INTEGER := 0;
  v_balance_added  INTEGER := 0;
  v_inconsistent   INTEGER := 0;
  v_balance_gap    INTEGER := 0;
BEGIN
  -- 迁移 117 未应用时 user_levels 没有 level_source 列，步骤 2 需跳过而非报错
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'user_levels'
      AND column_name  = 'level_source'
  ) INTO v_has_source;

  -- ----------------------------------------------------------
  -- 1. 修复 current_points（所有来源，一视同仁）
  --    同时把 next_level_points 对齐「按实际积分推算」的口径，
  --    与 #202608302900 中 setUserLevel 的新行为保持一致
  --    （PointsPanel 用 next_level_points - points 展示「距离下一级」）
  -- ----------------------------------------------------------
  WITH authoritative AS (
    SELECT
      u.id AS user_id,
      COALESCE(u.points, COALESCE((u.metadata->>'points')::integer, 0)) AS actual_points
    FROM public.users u
  ), target AS (
    SELECT
      a.user_id,
      a.actual_points,
      COALESCE((
        SELECT ld.required_points
        FROM public.level_definitions ld
        WHERE ld.required_points > a.actual_points
        ORDER BY ld.required_points ASC
        LIMIT 1
      ), a.actual_points) AS next_points
    FROM authoritative a
  )
  UPDATE public.user_levels ul
  SET
    current_points    = t.actual_points,
    next_level_points = t.next_points,
    updated_at        = now()
  FROM target t
  WHERE ul.user_id = t.user_id
    AND (
      ul.current_points IS DISTINCT FROM t.actual_points
      OR ul.next_level_points IS DISTINCT FROM t.next_points
    );

  GET DIAGNOSTICS v_fixed_points = ROW_COUNT;
  RAISE NOTICE '[120] 步骤1 修复 current_points / next_level_points: % 行', v_fixed_points;

  -- ----------------------------------------------------------
  -- 2. 对 level_source='points' 的行按积分重算等级
  --    口径与迁移 117 的 expire_expired_user_levels()、迁移 118 的
  --    add_points_atomic（MAX(level)）一致：取 required_points <= 实际积分 的最大等级
  -- ----------------------------------------------------------
  IF v_has_source THEN
    WITH authoritative AS (
      SELECT
        u.id AS user_id,
        COALESCE(u.points, COALESCE((u.metadata->>'points')::integer, 0)) AS actual_points
      FROM public.users u
    ), target AS (
      SELECT
        a.user_id,
        a.actual_points,
        COALESCE((
          SELECT ld.level
          FROM public.level_definitions ld
          WHERE ld.required_points <= a.actual_points
          ORDER BY ld.level DESC
          LIMIT 1
        ), 1) AS new_level
      FROM authoritative a
    )
    UPDATE public.user_levels ul
    SET
      level      = t.new_level,
      updated_at = now()
    FROM target t
    WHERE ul.user_id = t.user_id
      AND ul.level_source = 'points'
      AND ul.level IS DISTINCT FROM t.new_level;

    GET DIAGNOSTICS v_fixed_level = ROW_COUNT;
    RAISE NOTICE '[120] 步骤2 重算 level_source=''points'' 的等级: % 行', v_fixed_level;
  ELSE
    RAISE NOTICE '[120] 步骤2 已跳过：user_levels.level_source 列不存在（迁移 117 未应用）';
  END IF;

  -- ----------------------------------------------------------
  -- 3. 补齐缺失的 user_token_balance 行
  --    check_points_consistency() 用 COALESCE(utb.points_balance, -1) 比对，
  --    缺失该行会被判为不一致。仅 INSERT，不覆盖已有余额（避免破坏真实数据）。
  -- ----------------------------------------------------------
  IF to_regclass('public.user_token_balance') IS NOT NULL THEN
    INSERT INTO public.user_token_balance (user_id, points_balance, created_at, updated_at)
    SELECT
      u.id,
      COALESCE(u.points, COALESCE((u.metadata->>'points')::integer, 0)),
      now(),
      now()
    FROM public.users u
    ON CONFLICT (user_id) DO NOTHING;

    GET DIAGNOSTICS v_balance_added = ROW_COUNT;
    RAISE NOTICE '[120] 步骤3 补齐缺失的 user_token_balance 行: % 行', v_balance_added;
  ELSE
    RAISE NOTICE '[120] 步骤3 已跳过：user_token_balance 表不存在';
  END IF;

  -- ----------------------------------------------------------
  -- 4. 校验输出
  -- ----------------------------------------------------------
  IF to_regprocedure('public.check_points_consistency()') IS NOT NULL THEN
    SELECT count(*) INTO v_inconsistent FROM public.check_points_consistency();
  ELSE
    -- 巡检函数缺失（迁移 118 未应用）时按同一口径本地计算
    SELECT count(*) INTO v_inconsistent
    FROM public.users u
    LEFT JOIN public.user_token_balance utb ON utb.user_id = u.id
    LEFT JOIN public.user_levels ul ON ul.user_id = u.id
    WHERE COALESCE(utb.points_balance, -1)
            <> COALESCE(u.points, COALESCE((u.metadata->>'points')::integer, 0))
       OR COALESCE(ul.current_points, -1)
            <> COALESCE(u.points, COALESCE((u.metadata->>'points')::integer, 0));
  END IF;

  -- 单独统计「余额侧仍有差异」的行数（步骤 3 只补缺失、不覆盖，
  -- 这类行需人工确认后决定是否用 sync_user_points() 对齐）
  IF to_regclass('public.user_token_balance') IS NOT NULL THEN
    SELECT count(*) INTO v_balance_gap
    FROM public.users u
    JOIN public.user_token_balance utb ON utb.user_id = u.id
    WHERE COALESCE(utb.points_balance, -1)
            <> COALESCE(u.points, COALESCE((u.metadata->>'points')::integer, 0));
  END IF;

  RAISE NOTICE '============================================';
  RAISE NOTICE '[120] 历史等级积分数据修复完成';
  RAISE NOTICE '  修复 current_points/next_level_points: % 行', v_fixed_points;
  RAISE NOTICE '  重算等级(level_source=points):        % 行', v_fixed_level;
  RAISE NOTICE '  补齐 user_token_balance 缺失行:       % 行', v_balance_added;
  RAISE NOTICE '  check_points_consistency() 剩余:      % 行（应为 0）', v_inconsistent;
  RAISE NOTICE '  其中 user_token_balance 侧差异:       % 行（>0 时需人工确认）', v_balance_gap;
  RAISE NOTICE '============================================';
END $$;
