-- ============================================================
-- 迁移: 117_unified_levels_expiry
-- 对话窗: [#202608302400-权限体系全面修复] 阶段1
-- 说明:
--   1. user_levels 增加临时等级有效期（expiry_date）与等级来源（level_source）
--      修复 P0-3：积分兑换/付费购买的等级此前无有效期，兑换后永久有效
--   2. 统一等级命名为「用户、会员、白银、黄金、白金」（修复 P0-1）
--      消除 免费用户/普通会员/VIP会员/企业会员/超级会员 等旧别名
--   3. 提供过期降级函数 expire_expired_user_levels()，供定时任务/代码调用
--
-- 注意：本脚本不使用 BEGIN/COMMIT，便于通过 Supabase REST exec_sql 应用；
--       所有语句均为幂等（ADD COLUMN IF NOT EXISTS / ON CONFLICT / DO UPDATE）
-- 执行方式: Supabase SQL Editor 或 exec_sql(sql_query)
-- ============================================================

-- ------------------------------------------------------------
-- 1. user_levels 增加有效期与等级来源列
-- ------------------------------------------------------------
ALTER TABLE public.user_levels
  ADD COLUMN IF NOT EXISTS expiry_date TIMESTAMPTZ NULL;

ALTER TABLE public.user_levels
  ADD COLUMN IF NOT EXISTS level_source VARCHAR(20) NOT NULL DEFAULT 'points';

COMMENT ON COLUMN public.user_levels.expiry_date IS
  '临时等级到期时间（NULL=永久）。到期后按当前积分重新计算等级并自动降级。';

COMMENT ON COLUMN public.user_levels.level_source IS
  '等级来源: points=积分自动升级(永久) / exchange=积分兑换(临时) / purchase=付费购买(临时) / admin=管理员设置(永久)';

CREATE INDEX IF NOT EXISTS idx_user_levels_expiry_date
  ON public.user_levels (expiry_date)
  WHERE expiry_date IS NOT NULL;

-- 历史数据兜底：已有记录默认视为积分来源（永久）
UPDATE public.user_levels
SET level_source = 'points'
WHERE level_source IS NULL OR level_source = '';

-- ------------------------------------------------------------
-- 2. 统一等级命名（member_levels 为配置权威源）
--    用户 / 会员 / 白银 / 黄金 / 白金
-- ------------------------------------------------------------
INSERT INTO public.member_levels (level_code, level_name, required_points, sort_order, is_default, daily_quota, max_files, max_chat_messages, description)
VALUES
  ('L0', '用户', 0,     0, true,  0,   0,  0,   '免费用户，基础功能'),
  ('L1', '会员', 100,   1, false, 10,  5,  10,  '初级会员'),
  ('L2', '白银', 500,   2, false, 20,  10, 20,  '白银会员'),
  ('L3', '黄金', 2000,  3, false, 50,  20, 50,  '黄金会员'),
  ('L4', '白金', 10000, 4, false, 100, 50, 100, '白金会员')
ON CONFLICT (level_code) DO UPDATE SET
  level_name        = EXCLUDED.level_name,
  required_points   = EXCLUDED.required_points,
  sort_order        = EXCLUDED.sort_order,
  is_default        = EXCLUDED.is_default,
  daily_quota       = EXCLUDED.daily_quota,
  max_files         = EXCLUDED.max_files,
  max_chat_messages = EXCLUDED.max_chat_messages,
  description       = EXCLUDED.description,
  updated_at        = now();

-- 兼容修复：部分环境的 level_definitions 缺少 updated_at 列
--   （040 建表时仅有 created_at，而迁移 073 与本脚本均会写入 updated_at）
--   此处幂等补齐，避免 UPDATE 报 42703
ALTER TABLE public.level_definitions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 同步业务层读取的 level_definitions（level 1-5 ↔ L0-L4）
UPDATE public.level_definitions ld
SET name              = ml.level_name,
    required_points   = ml.required_points,
    role              = map.role_code,
    daily_quota       = ml.daily_quota,
    max_files         = ml.max_files,
    max_chat_messages = ml.max_chat_messages,
    updated_at        = now()
FROM (VALUES
  ('L0', 1, 'free'),
  ('L1', 2, 'basic'),
  ('L2', 3, 'standard'),
  ('L3', 4, 'premium'),
  ('L4', 5, 'vip')
) AS map(level_code, lvl, role_code)
JOIN public.member_levels ml ON ml.level_code = map.level_code
WHERE ld.level = map.lvl
  AND (ld.name IS DISTINCT FROM ml.level_name
    OR ld.required_points IS DISTINCT FROM ml.required_points
    OR ld.role IS DISTINCT FROM map.role_code
    OR ld.daily_quota IS DISTINCT FROM ml.daily_quota
    OR ld.max_files IS DISTINCT FROM ml.max_files
    OR ld.max_chat_messages IS DISTINCT FROM ml.max_chat_messages);

-- level_definitions 缺失等级时补建（幂等）
INSERT INTO public.level_definitions (level, name, required_points, role, daily_quota, max_files, max_chat_messages)
SELECT map.lvl, ml.level_name, ml.required_points, map.role_code, ml.daily_quota, ml.max_files, ml.max_chat_messages
FROM (VALUES
  ('L0', 1, 'free'),
  ('L1', 2, 'basic'),
  ('L2', 3, 'standard'),
  ('L3', 4, 'premium'),
  ('L4', 5, 'vip')
) AS map(level_code, lvl, role_code)
JOIN public.member_levels ml ON ml.level_code = map.level_code
ON CONFLICT (level) DO NOTHING;

-- ------------------------------------------------------------
-- 3. 过期降级函数
--    将所有已过期（expiry_date < now()）的临时等级降回积分对应等级
--    返回被降级的记录数
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_expired_user_levels()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  affected INTEGER := 0;
BEGIN
  WITH expired AS (
    SELECT ul.user_id, ul.level AS old_level, ul.current_points
    FROM public.user_levels ul
    WHERE ul.expiry_date IS NOT NULL
      AND ul.expiry_date < now()
  ), recalc AS (
    SELECT
      e.user_id,
      e.old_level,
      COALESCE((
        SELECT ld.level
        FROM public.level_definitions ld
        WHERE ld.required_points <= COALESCE(e.current_points, 0)
        ORDER BY ld.level DESC
        LIMIT 1
      ), 1) AS new_level
    FROM expired e
  ), updated AS (
    UPDATE public.user_levels ul
    SET level        = r.new_level,
        expiry_date  = NULL,
        level_source = 'points',
        updated_at   = now()
    FROM recalc r
    WHERE ul.user_id = r.user_id
      AND ul.level IS DISTINCT FROM r.new_level
    RETURNING ul.user_id, r.old_level, r.new_level, ul.current_points
  )
  SELECT COUNT(*) INTO affected FROM updated;

  RETURN affected;
END;
$$;

COMMENT ON FUNCTION public.expire_expired_user_levels() IS
  '将所有已过期的临时等级（expiry_date < now()）降回当前积分对应的等级，并清空有效期。返回受影响行数。';

-- ------------------------------------------------------------
-- 4. 刷新 PostgREST schema 缓存
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
