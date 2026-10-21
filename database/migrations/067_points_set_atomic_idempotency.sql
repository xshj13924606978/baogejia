-- ============================================================
-- 067_points_set_atomic_idempotency.sql
-- 给 set_points_atomic 添加 reference_id 幂等保护
--
-- 问题：deduct_points_atomic / add_points_atomic 已在 044 增加幂等，
--       但 set_points_atomic 仍无幂等检查，重复调用会导致
--       积分重复写入/重复流水。
-- 解决：在读写前检查 point_records.reference_id 是否已存在，
--       若存在则直接返回成功（幂等重放）。
-- ============================================================

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

    RETURN jsonb_build_object(
        'success', true,
        'old_points', v_old_points,
        'new_points', p_new_points,
        'diff', v_diff,
        'level', v_new_level
    );
END;
$function$;

-- 刷新 PostgREST schema 缓存
NOTIFY pgrst, 'reload schema';
