-- ============================================================
-- 044_add_idempotency_to_points.sql
-- 给积分原子操作函数添加 reference_id 幂等保护
--
-- 问题：deduct_points_atomic / add_points_atomic 没有幂等检查，
--       前端重复发送请求会导致积分重复扣减/增加。
-- 解决：在写入 point_records 前检查 reference_id 是否已存在，
--       若存在则直接返回成功（幂等重放）。
-- ============================================================

-- 1. 增强 deduct_points_atomic（幂等保护）
-- ============================================================
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

    RETURN jsonb_build_object(
        'success', true,
        'new_points', v_new_points,
        'level', v_new_level
    );
END;
$function$;

-- 2. 增强 add_points_atomic（幂等保护）
-- ============================================================
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

    RETURN jsonb_build_object(
        'success', true,
        'new_points', v_new_points,
        'new_total_points', v_new_total,
        'level', v_new_level
    );
END;
$function$;

-- 刷新 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
