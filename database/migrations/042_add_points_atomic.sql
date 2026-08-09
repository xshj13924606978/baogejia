-- ============================================================
-- 042_add_points_atomic.sql
-- 创建原子积分操作 RPC 函数，解决竞态条件问题
--
-- 问题：原有 points-service 使用 read-modify-write 模式更新积分，
--       在并发请求下会导致积分重复消费或变负。
-- 解决：使用 PostgreSQL 单条 UPDATE + JSONB 路径操作实现原子更新，
--       避免应用层的 read-modify-write 竞态条件。
-- ============================================================

-- ============================================================
-- 1. 原子积分增减函数
--    在单条 SQL 中完成：读取当前值 → 计算 → 写回
--    利用 UPDATE ... SET metadata = jsonb_set(...) 的原子性
-- ============================================================

CREATE OR REPLACE FUNCTION add_points_atomic(
  p_user_id UUID,
  p_points INTEGER
)
RETURNS JSONB
LANGUAGE sql
AS $$
  WITH updated AS (
    UPDATE users
    SET
      metadata = jsonb_set(
        jsonb_set(
          jsonb_set(
            COALESCE(metadata, '{}'::jsonb),
            '{points}',
            to_jsonb(COALESCE((metadata->>'points')::integer, 0) + p_points)
          ),
          '{total_points}',
          to_jsonb(
            CASE
              WHEN p_points > 0 THEN
                COALESCE((metadata->>'total_points')::integer, 0) + p_points
              ELSE
                COALESCE((metadata->>'total_points')::integer, 0)
            END
          )
        ),
        '{last_points_update}',
        to_jsonb(NOW()::text)
      ),
      updated_at = NOW()
    WHERE id = p_user_id
    RETURNING
      COALESCE((metadata->>'points')::integer, 0) AS new_points,
      COALESCE((metadata->>'total_points')::integer, 0) AS new_total_points
  )
  SELECT to_jsonb(json_build_object(
    'new_points', COALESCE(u.new_points, 0),
    'new_total_points', COALESCE(u.new_total_points, 0)
  ))
  FROM updated u;
$$;

-- ============================================================
-- 2. 原子积分扣除函数（带余额校验）
--    在扣除前校验余额是否充足，防止积分变负
--    返回 success=true/false 和 new_points
-- ============================================================

CREATE OR REPLACE FUNCTION deduct_points_atomic(
  p_user_id UUID,
  p_points INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_points INTEGER;
  v_result JSONB;
BEGIN
  -- 读取当前积分（使用 FOR UPDATE 锁定行，防止并发修改）
  SELECT COALESCE((metadata->>'points')::integer, 0)
  INTO v_current_points
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_current_points IS NULL THEN
    -- 用户不存在
    RETURN jsonb_build_object('success', false, 'reason', '用户不存在', 'new_points', 0);
  END IF;

  IF v_current_points < p_points THEN
    -- 余额不足
    RETURN jsonb_build_object('success', false, 'reason', '积分不足', 'new_points', v_current_points);
  END IF;

  -- 原子扣除
  UPDATE users
  SET
    metadata = jsonb_set(
      jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{points}',
        to_jsonb(v_current_points - p_points)
      ),
      '{last_points_update}',
      to_jsonb(NOW()::text)
    ),
    updated_at = NOW()
  WHERE id = p_user_id
  RETURNING jsonb_build_object(
    'success', true,
    'new_points', COALESCE((metadata->>'points')::integer, 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 3. 安全的积分设置函数（管理员操作）
--    直接设置积分值，同时更新 total_points
-- ============================================================

CREATE OR REPLACE FUNCTION set_points_atomic(
  p_user_id UUID,
  p_new_points INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_old_points INTEGER;
  v_diff INTEGER;
  v_result JSONB;
BEGIN
  -- 读取当前积分（使用 FOR UPDATE 锁定行）
  SELECT COALESCE((metadata->>'points')::integer, 0)
  INTO v_old_points
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF v_old_points IS NULL THEN
    RETURN jsonb_build_object('success', false, 'reason', '用户不存在');
  END IF;

  v_diff := p_new_points - v_old_points;

  UPDATE users
  SET
    metadata = jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{points}',
          to_jsonb(p_new_points)
        ),
        '{total_points}',
        to_jsonb(
          CASE
            WHEN v_diff > 0 THEN
              COALESCE((metadata->>'total_points')::integer, 0) + v_diff
            ELSE
              COALESCE((metadata->>'total_points')::integer, 0)
          END
        )
      ),
      '{last_points_update}',
      to_jsonb(NOW()::text)
    ),
    updated_at = NOW()
  WHERE id = p_user_id
  RETURNING jsonb_build_object(
    'success', true,
    'old_points', v_old_points,
    'new_points', p_new_points,
    'diff', v_diff
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- ============================================================
-- 4. 授权：允许 service_role 角色调用（已有 RLS 豁免）
--    如果使用了 anon key 的 RPC 调用，需要确保 RLS 允许
-- ============================================================

-- 确认函数权限（通常 CREATE OR REPLACE FUNCTION 由 superuser 执行，
-- 默认 SECURITY DEFINER，所有角色可调用）
ALTER FUNCTION add_points_atomic(UUID, INTEGER) SECURITY DEFINER;
ALTER FUNCTION deduct_points_atomic(UUID, INTEGER) SECURITY DEFINER;
ALTER FUNCTION set_points_atomic(UUID, INTEGER) SECURITY DEFINER;

-- 刷新 PostgREST schema 缓存，让新函数立即可用
NOTIFY pgrst, 'reload schema';
