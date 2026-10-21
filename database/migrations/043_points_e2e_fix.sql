-- =============================================================
-- 043: 积分系统端到端链路修复
-- 目标：让「获取→消费→流水→等级→展示」全链路在 live 库真正跑通
--
-- 断点清单：
--   1. point_records 开启 RLS 但没有任何 policy → anon 客户端写入被拒，流水静默丢失
--   2. point_logs SELECT policy 仅允许 auth.uid() = user_id，
--      而应用在服务端用 anon key + 自定义 session 鉴权（无用户 JWT）→ 流水 API 查不到
--   3. user_levels.user_id 无唯一约束 → ON CONFLICT (user_id) upsert 永不生效
--   4. 原子 RPC 只写 point_logs，不写 point_records、不同步 user_levels → 三表不一致
--
-- 注：与现有安全模型保持一致（users 表本身未开 RLS，鉴权在 API 层完成），
--     point_logs/point_records 的 SELECT 均放开。
-- =============================================================

-- 1) point_records RLS 策略（写入放开，读取放开）
ALTER TABLE public.point_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "point_records_insert_open" ON public.point_records;
CREATE POLICY "point_records_insert_open" ON public.point_records
  FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "point_records_select_open" ON public.point_records;
CREATE POLICY "point_records_select_open" ON public.point_records
  FOR SELECT TO public USING (true);

-- 2) point_logs SELECT 放开（原 policy 只允许 auth.uid()=user_id，服务端 anon 无 JWT 恒为 false）
DROP POLICY IF EXISTS "用户可以查看自己的积分流水" ON public.point_logs;
CREATE POLICY "point_logs_select_open" ON public.point_logs
  FOR SELECT TO public USING (true);

-- 3) user_levels.user_id 唯一约束（支持 ON CONFLICT (user_id) upsert）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_levels_user_id_key' AND conrelid = 'public.user_levels'::regclass
  ) THEN
    ALTER TABLE public.user_levels ADD CONSTRAINT user_levels_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- =============================================================
-- 4) 增强 add_points_atomic
--    新增可选参数 p_type / p_description / p_reference_id（向后兼容）
--    额外行为：写 point_records、按 level_definitions 自动判级并同步 user_levels
-- =============================================================
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
BEGIN
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

    -- 等级联动：按 level_definitions 阈值自动判级
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

-- =============================================================
-- 5) 增强 deduct_points_atomic（新增可选参数，写 point_records + 同步 user_levels）
-- =============================================================
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
BEGIN
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

-- =============================================================
-- 6) 增强 set_points_atomic（新增可选参数，写双表流水 + 同步 user_levels）
-- =============================================================
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
BEGIN
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
