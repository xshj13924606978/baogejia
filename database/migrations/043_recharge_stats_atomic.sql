-- ============================================================
-- 043_recharge_stats_atomic.sql
-- 创建原子充值统计更新 RPC 函数
--
-- 问题：rechargePoints 中 total_recharged 的 read-modify-write
--       在并发充值时会导致统计不准确。
-- 解决：使用 jsonb_set + FOR UPDATE 原子更新。
-- ============================================================

CREATE OR REPLACE FUNCTION public.recharge_stats_atomic(
  p_user_id uuid,
  p_amount numeric,
  p_points integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user jsonb;
BEGIN
  -- 锁定用户行
  SELECT metadata INTO v_user
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  -- 原子更新充值统计
  UPDATE users
  SET metadata = jsonb_set(
    jsonb_set(
      COALESCE(metadata, '{}'),
      '{total_recharged}',
      to_jsonb(COALESCE((metadata->>'total_recharged')::numeric, 0) + p_amount)
    ),
    '{total_recharged_points}',
    to_jsonb(COALESCE((metadata->>'total_recharged_points')::integer, 0) + p_points)
  )
  WHERE id = p_user_id;

  -- 通知 PostgREST 刷新 schema cache
  NOTIFY pgrst, 'reload schema';
END;
$$;

COMMENT ON FUNCTION public.recharge_stats_atomic IS '原子更新用户充值统计，防止并发竞态';
