-- ============================================================
-- 迁移: 118_points_three_store_sync
-- 对话窗: [#202608302400-权限体系全面修复] 阶段4 P1-2
-- 说明:
--   1. 积分三处存储统一同步：users.points / user_token_balance.points_balance /
--      user_levels.current_points
--      现状（044/067）：add_points_atomic / deduct_points_atomic / set_points_atomic
--      已同步 users.points(+metadata) 与 user_levels，
--      但 **user_token_balance.points_balance 完全未同步** → 计费侧余额长期失真。
--   2. 新增对账与修复函数：
--      - sync_user_points(p_user_id)   单用户修复（以 users.points 为准）
--      - sync_all_users_points()       全量修复，返回修复行数
--      - check_points_consistency()    查询当前不一致的用户（只读，便于巡检）
--
-- 注意：不使用 BEGIN/COMMIT，便于通过 Supabase REST exec_sql 应用；
--       所有语句幂等（CREATE OR REPLACE）。同步块用 to_regclass 做存在性保护，
--       表不存在时不报错（兼容不同环境）。
-- 执行方式: Supabase SQL Editor 或 exec_sql(sql_query)
-- ============================================================

-- ============================================================
-- 1. 同步 user_token_balance 的公共逻辑说明
--    三个原子函数内部统一追加如下块（以 v_new_points 为最新积分）：
--
--    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
--      INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
--      VALUES (p_user_id, v_new_points, NOW(), NOW())
--      ON CONFLICT (user_id) DO UPDATE SET
--        points_balance = EXCLUDED.points_balance,
--        updated_at = NOW();
--    END IF;
-- ============================================================

-- ------------------------------------------------------------
-- 2. 增强 add_points_atomic（在 044 基础上增加 user_token_balance 同步）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_points_atomic(
  p_user_id uuid,
  p_points integer,
  p_type text DEFAULT 'earn',
  p_description text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_old_points INTEGER;
    v_new_points INTEGER;
    v_old_total INTEGER;
    v_new_total INTEGER;
    v_type TEXT;
    v_desc TEXT;
    v_new_level INTEGER;
    v_next_level_points INTEGER;
    v_existing RECORD;
BEGIN
    -- 幂等保护：若 reference_id 已存在，直接返回成功
    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing
        FROM point_records
        WHERE user_id = p_user_id
          AND reference_id = p_reference_id
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'reason', '幂等重放，已处理', 'new_points', v_old_points);
        END IF;
    END IF;

    -- 锁定用户行
    SELECT
        COALESCE((metadata->>'points')::INTEGER, 0),
        COALESCE((metadata->>'total_points')::INTEGER, 0)
    INTO v_old_points, v_old_total
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_old_points IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;

    v_new_points := v_old_points + p_points;
    v_new_total := v_old_total + CASE WHEN p_points > 0 THEN p_points ELSE 0 END;
    v_type := COALESCE(p_type, CASE WHEN p_points > 0 THEN 'earn' ELSE 'spend' END);
    v_desc := COALESCE(p_description, CASE WHEN p_points > 0 THEN '积分增加' ELSE '积分扣除' END);

    -- 更新 users（points 列 + metadata 双写）
    UPDATE users
    SET metadata = jsonb_set(
            jsonb_set(
                jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{points}', to_jsonb(v_new_points)
                ),
                '{total_points}', to_jsonb(v_new_total)
            ),
            '{last_points_update}', to_jsonb(NOW()::text)
        ),
        points = v_new_points,
        total_points = v_new_total,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 流水双写 point_logs + point_records
    INSERT INTO point_logs (user_id, points, type, description, balance_after)
    VALUES (p_user_id, p_points, v_type, v_desc, v_new_points);

    INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, p_points, v_type, v_desc, v_new_points, p_reference_id);

    -- 等级联动
    SELECT COALESCE(MAX(level), 1) INTO v_new_level
    FROM level_definitions
    WHERE required_points <= v_new_points;

    SELECT COALESCE(MIN(required_points), v_new_points) INTO v_next_level_points
    FROM level_definitions
    WHERE required_points > v_new_points;

    INSERT INTO user_levels (user_id, level, current_points, next_level_points, created_at, updated_at)
    VALUES (p_user_id, v_new_level, v_new_points, v_next_level_points, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        level = EXCLUDED.level,
        current_points = EXCLUDED.current_points,
        next_level_points = EXCLUDED.next_level_points,
        updated_at = NOW();

    -- #202608302400 阶段4 P1-2：同步 user_token_balance（第三处存储）
    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, v_new_points, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            points_balance = EXCLUDED.points_balance,
            updated_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'new_points', v_new_points,
        'new_total_points', v_new_total,
        'level', v_new_level
    );
END;
$function$;

-- ------------------------------------------------------------
-- 3. 增强 deduct_points_atomic（在 044 基础上增加 user_token_balance 同步）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.deduct_points_atomic(
  p_user_id uuid,
  p_points integer,
  p_type text DEFAULT 'spend',
  p_description text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_current_points INTEGER;
    v_new_points INTEGER;
    v_type TEXT;
    v_desc TEXT;
    v_new_level INTEGER;
    v_next_level_points INTEGER;
    v_existing RECORD;
BEGIN
    -- 幂等保护：若 reference_id 已存在，直接返回成功
    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing
        FROM point_records
        WHERE user_id = p_user_id
          AND reference_id = p_reference_id
        LIMIT 1;

        IF FOUND THEN
            RETURN jsonb_build_object('success', true, 'reason', '幂等重放，已处理', 'new_points', v_current_points);
        END IF;
    END IF;

    -- 锁定用户行并读取当前积分
    SELECT COALESCE((metadata->>'points')::INTEGER, 0)
    INTO v_current_points
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_current_points IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在', 'new_points', 0);
    END IF;

    IF v_current_points < p_points THEN
        RETURN jsonb_build_object('success', false, 'reason', '积分不足', 'new_points', v_current_points);
    END IF;

    v_new_points := v_current_points - p_points;
    v_type := COALESCE(p_type, 'spend');
    v_desc := COALESCE(p_description, '积分扣除');

    -- 更新 users（points 列 + metadata）
    UPDATE users
    SET metadata = jsonb_set(
            jsonb_set(
                COALESCE(metadata, '{}'::jsonb),
                '{points}', to_jsonb(v_new_points)
            ),
            '{last_points_update}', to_jsonb(NOW()::text)
        ),
        points = v_new_points,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 流水双写（负数表示扣除）
    INSERT INTO point_logs (user_id, points, type, description, balance_after)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_new_points);

    INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
    VALUES (p_user_id, -p_points, v_type, v_desc, v_new_points, p_reference_id);

    -- 等级联动
    SELECT COALESCE(MAX(level), 1) INTO v_new_level
    FROM level_definitions
    WHERE required_points <= v_new_points;

    SELECT COALESCE(MIN(required_points), v_new_points) INTO v_next_level_points
    FROM level_definitions
    WHERE required_points > v_new_points;

    INSERT INTO user_levels (user_id, level, current_points, next_level_points, created_at, updated_at)
    VALUES (p_user_id, v_new_level, v_new_points, v_next_level_points, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        level = EXCLUDED.level,
        current_points = EXCLUDED.current_points,
        next_level_points = EXCLUDED.next_level_points,
        updated_at = NOW();

    -- #202608302400 阶段4 P1-2：同步 user_token_balance（第三处存储）
    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, v_new_points, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            points_balance = EXCLUDED.points_balance,
            updated_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'new_points', v_new_points,
        'level', v_new_level
    );
END;
$function$;

-- ------------------------------------------------------------
-- 4. 增强 set_points_atomic（在 067 基础上增加 user_token_balance 同步）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_points_atomic(
  p_user_id uuid,
  p_new_points integer,
  p_type text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_reference_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_old_points INTEGER;
    v_diff INTEGER;
    v_type TEXT;
    v_desc TEXT;
    v_new_level INTEGER;
    v_next_level_points INTEGER;
    v_existing RECORD;
BEGIN
    -- 幂等保护：若 reference_id 已存在，直接返回成功
    IF p_reference_id IS NOT NULL THEN
        SELECT id INTO v_existing
        FROM point_records
        WHERE user_id = p_user_id
          AND reference_id = p_reference_id
        LIMIT 1;

        IF FOUND THEN
            SELECT COALESCE((metadata->>'points')::integer, 0)
            INTO v_old_points
            FROM users
            WHERE id = p_user_id;

            RETURN jsonb_build_object(
                'success', true,
                'reason', '幂等重放，已处理',
                'new_points', v_old_points
            );
        END IF;
    END IF;

    -- 读取当前积分（FOR UPDATE 锁定行）
    SELECT COALESCE((metadata->>'points')::integer, 0)
    INTO v_old_points
    FROM users
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_old_points IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;

    v_diff := p_new_points - v_old_points;
    v_type := COALESCE(p_type, CASE WHEN v_diff > 0 THEN 'admin_grant' WHEN v_diff < 0 THEN 'admin_deduct' ELSE 'admin_set' END);
    v_desc := COALESCE(p_description, '管理员设置积分');

    UPDATE users
    SET metadata = jsonb_set(
            jsonb_set(
                jsonb_set(
                    COALESCE(metadata, '{}'::jsonb),
                    '{points}', to_jsonb(p_new_points)
                ),
                '{total_points}', to_jsonb(
                    CASE WHEN v_diff > 0 THEN
                        COALESCE((metadata->>'total_points')::integer, 0) + v_diff
                    ELSE
                        COALESCE((metadata->>'total_points')::integer, 0)
                    END
                )
            ),
            '{last_points_update}', to_jsonb(NOW()::text)
        ),
        points = p_new_points,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 发生变动才写流水（避免 0 差异噪音）
    IF v_diff <> 0 THEN
        INSERT INTO point_logs (user_id, points, type, description, balance_after)
        VALUES (p_user_id, v_diff, v_type, v_desc, p_new_points);

        INSERT INTO point_records (user_id, points, type, description, balance_after, reference_id)
        VALUES (p_user_id, v_diff, v_type, v_desc, p_new_points, p_reference_id);
    END IF;

    -- 等级联动
    SELECT COALESCE(MAX(level), 1) INTO v_new_level
    FROM level_definitions
    WHERE required_points <= p_new_points;

    SELECT COALESCE(MIN(required_points), p_new_points) INTO v_next_level_points
    FROM level_definitions
    WHERE required_points > p_new_points;

    INSERT INTO user_levels (user_id, level, current_points, next_level_points, created_at, updated_at)
    VALUES (p_user_id, v_new_level, p_new_points, v_next_level_points, NOW(), NOW())
    ON CONFLICT (user_id) DO UPDATE SET
        level = EXCLUDED.level,
        current_points = EXCLUDED.current_points,
        next_level_points = EXCLUDED.next_level_points,
        updated_at = NOW();

    -- #202608302400 阶段4 P1-2：同步 user_token_balance（第三处存储）
    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, p_new_points, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            points_balance = EXCLUDED.points_balance,
            updated_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'old_points', v_old_points,
        'new_points', p_new_points,
        'diff', v_diff,
        'level', v_new_level
    );
END;
$function$;

-- ------------------------------------------------------------
-- 5. 单用户对账修复（以 users.points 为唯一权威值）
--    保护未过期的临时等级：不同步 level，仅同步积分
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_user_points(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_points INTEGER;
    v_token_balance INTEGER;
    v_level_points INTEGER;
    v_expiry TIMESTAMPTZ;
    v_new_level INTEGER;
    v_next_points INTEGER;
    v_fixed BOOLEAN := false;
BEGIN
    SELECT COALESCE(points, COALESCE((metadata->>'points')::integer, 0))
    INTO v_points
    FROM users
    WHERE id = p_user_id;

    IF v_points IS NULL THEN
        RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
    END IF;

    SELECT points_balance INTO v_token_balance
    FROM user_token_balance WHERE user_id = p_user_id;

    SELECT current_points, expiry_date INTO v_level_points, v_expiry
    FROM user_levels WHERE user_id = p_user_id;

    IF v_token_balance IS DISTINCT FROM v_points THEN v_fixed := true; END IF;
    IF v_level_points IS DISTINCT FROM v_points THEN v_fixed := true; END IF;

    -- 修复 user_token_balance
    IF to_regclass('public.user_token_balance') IS NOT NULL THEN
        INSERT INTO user_token_balance (user_id, points_balance, created_at, updated_at)
        VALUES (p_user_id, v_points, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            points_balance = EXCLUDED.points_balance,
            updated_at = NOW();
    END IF;

    -- 修复 user_levels
    IF v_expiry IS NOT NULL AND v_expiry > NOW() THEN
        -- 临时等级未过期：只同步积分，保留等级与有效期
        UPDATE user_levels
        SET current_points = v_points, updated_at = NOW()
        WHERE user_id = p_user_id;
    ELSE
        SELECT COALESCE(MAX(level), 1) INTO v_new_level
        FROM level_definitions WHERE required_points <= v_points;

        SELECT COALESCE(MIN(required_points), v_points) INTO v_next_points
        FROM level_definitions WHERE required_points > v_points;

        INSERT INTO user_levels (user_id, level, current_points, next_level_points, created_at, updated_at)
        VALUES (p_user_id, v_new_level, v_points, v_next_points, NOW(), NOW())
        ON CONFLICT (user_id) DO UPDATE SET
            level = EXCLUDED.level,
            current_points = EXCLUDED.current_points,
            next_level_points = EXCLUDED.next_level_points,
            expiry_date = NULL,
            updated_at = NOW();
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'user_id', p_user_id,
        'points', v_points,
        'fixed', v_fixed,
        'old_token_balance', v_token_balance,
        'old_level_points', v_level_points
    );
END;
$function$;

-- ------------------------------------------------------------
-- 6. 全量对账修复（返回被修复的用户数）
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_all_users_points()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_count INTEGER := 0;
    r RECORD;
    res JSONB;
BEGIN
    FOR r IN SELECT id FROM users LOOP
        res := public.sync_user_points(r.id);
        IF COALESCE((res->>'fixed')::boolean, false) THEN
            v_count := v_count + 1;
        END IF;
    END LOOP;
    RETURN v_count;
END;
$function$;

-- ------------------------------------------------------------
-- 7. 一致性巡检（只读）：返回三处不一致的用户
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_points_consistency()
RETURNS TABLE(
    user_id uuid,
    users_points integer,
    token_balance integer,
    level_points integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
    SELECT
        u.id AS user_id,
        COALESCE(u.points, COALESCE((u.metadata->>'points')::integer, 0)) AS users_points,
        utb.points_balance AS token_balance,
        ul.current_points AS level_points
    FROM users u
    LEFT JOIN user_token_balance utb ON utb.user_id = u.id
    LEFT JOIN user_levels ul ON ul.user_id = u.id
    WHERE COALESCE(utb.points_balance, -1)
          <> COALESCE(u.points, COALESCE((u.metadata->>'points')::integer, 0))
       OR COALESCE(ul.current_points, -1)
          <> COALESCE(u.points, COALESCE((u.metadata->>'points')::integer, 0));
$function$;

COMMENT ON FUNCTION public.sync_user_points(uuid) IS
  '以 users.points 为权威值，修复 user_token_balance.points_balance 与 user_levels.current_points。未过期的临时等级不会被降级。';
COMMENT ON FUNCTION public.sync_all_users_points() IS
  '全量对账修复所有用户的积分三处存储，返回被修复的用户数。';
COMMENT ON FUNCTION public.check_points_consistency() IS
  '只读巡检：返回积分三处存储不一致的用户列表。';

-- ------------------------------------------------------------
-- 8. 刷新 PostgREST schema 缓存
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
